import type { Data, Player, Settings } from "../schemas";
import type { TransferAction } from "./types";
import { excessClubIds } from "./squad-rules";

export type SquadState = {
  squad: Player[];
  bank: number;
  sellingPrices: ReadonlyMap<number, number>;
};

export type TransferRules = {
  byId: ReadonlyMap<number, Player>;
  lockedPlayerIds: readonly number[];
  clubLimit: number;
};

type Swap = Pick<TransferAction, "outId" | "inId">;

export type TransferCheck =
  { legal: true; state: SquadState } | { legal: false; reason: string };

export function isTransferable(player: Player): boolean {
  return player.can_select && player.can_transact;
}

export function transferRules(
  data: Data,
  settings: Pick<Settings, "lockedPlayerIds">,
): TransferRules {
  return {
    byId: new Map(data.bootstrap.elements.map((player) => [player.id, player])),
    lockedPlayerIds: settings.lockedPlayerIds ?? [],
    clubLimit: data.bootstrap.game_settings.squad_team_limit,
  };
}

export function startingState(
  settings: Pick<Settings, "bank" | "squad">,
  squad: Player[],
): SquadState {
  return {
    squad,
    bank: settings.bank,
    sellingPrices: new Map(
      settings.squad.map((pick) => [pick.id, pick.sellingPrice]),
    ),
  };
}

function swapProblem(
  rules: TransferRules,
  owned: ReadonlySet<number>,
  seen: { outgoing: Set<number>; incoming: Set<number> },
  { outId, inId }: Swap,
): string | null {
  const outgoing = rules.byId.get(outId);
  const incoming = rules.byId.get(inId);
  if (!outgoing || !owned.has(outId))
    return "The outgoing player must belong to your squad.";
  if (rules.lockedPlayerIds.includes(outId))
    return `${outgoing.web_name} is locked. Unlock them to compare this transfer.`;
  if (!incoming) return "Choose a valid incoming player.";
  if (owned.has(inId)) return "The incoming player is already in your squad.";
  if (seen.outgoing.has(outId) || seen.incoming.has(inId))
    return "Each player can appear only once in a transfer batch.";
  if (!isTransferable(incoming))
    return "The incoming player is not available for transfers.";
  if (incoming.element_type !== outgoing.element_type)
    return "Choose players in the same position.";
  return null;
}

export function checkTransfers(
  rules: TransferRules,
  state: SquadState,
  swaps: readonly Swap[],
): TransferCheck {
  const owned = new Set(state.squad.map((player) => player.id));
  const seen = { outgoing: new Set<number>(), incoming: new Set<number>() };
  let bank = state.bank;
  for (const swap of swaps) {
    const reason = swapProblem(rules, owned, seen, swap);
    if (reason) return { legal: false, reason };
    seen.outgoing.add(swap.outId);
    seen.incoming.add(swap.inId);
    const outgoing = rules.byId.get(swap.outId)!;
    const incoming = rules.byId.get(swap.inId)!;
    bank +=
      (state.sellingPrices.get(swap.outId) ?? outgoing.now_cost) -
      incoming.now_cost;
  }
  if (bank < 0)
    return {
      legal: false,
      reason:
        "This transfer is unaffordable with your bank and selling prices.",
    };
  const replacements = new Map(
    swaps.map((swap) => [swap.outId, rules.byId.get(swap.inId)!]),
  );
  const squad = state.squad.map(
    (player) => replacements.get(player.id) ?? player,
  );
  if (swaps.length && excessClubIds(squad, rules.clubLimit).length)
    return {
      legal: false,
      reason: "This transfer exceeds the club player limit.",
    };
  const sellingPrices = new Map(state.sellingPrices);
  for (const { outId, inId } of swaps) {
    sellingPrices.delete(outId);
    sellingPrices.set(inId, rules.byId.get(inId)!.now_cost);
  }
  return { legal: true, state: { squad, bank, sellingPrices } };
}

export function applyTransfers(
  rules: TransferRules,
  state: SquadState,
  swaps: readonly Swap[],
): SquadState {
  const check = checkTransfers(rules, state, swaps);
  if (!check.legal) throw new Error(check.reason);
  return check.state;
}
