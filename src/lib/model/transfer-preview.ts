import type { Data, Player, Settings } from "../schemas";
import type { Lineup, Move, TransferAction } from "./types";
import { excessClubIds, validateSquad } from "./squad-rules";
import { fixturesFor, upcomingWeeks } from "./schedule";
import {
  availability,
  expectedMinutes,
  playerRisks,
  scorePlayer,
} from "./scoring";
import { bestLineup } from "./lineup";

const round = (value: number) => Math.round(value * 100) / 100;

export function transferContext(data: Data, settings: Settings) {
  const errors = validateSquad(data, settings);
  if (errors.length) throw new Error(errors.join(" "));
  const weeks = upcomingWeeks(data);
  const byId = new Map(
    data.bootstrap.elements.map((player) => [player.id, player]),
  );
  const squad = settings.squad.map((pick) => byId.get(pick.id)!);
  const scores = weeks.map(
    (week) =>
      new Map(
        data.bootstrap.elements.map((player) => [
          player.id,
          scorePlayer(data, player, week, settings.availabilityScenario),
        ]),
      ),
  );
  const baseline = scores.map((values) => bestLineup(data, squad, values));
  return { data, settings, weeks, byId, squad, scores, baseline };
}

type Context = ReturnType<typeof transferContext>;

function applyTransfers(
  data: Data,
  settings: Settings,
  squad: Player[],
  prices: Map<number, number>,
  bank: number,
  actions: TransferAction[],
) {
  const byId = new Map(
    data.bootstrap.elements.map((player) => [player.id, player]),
  );
  const owned = new Set(squad.map((player) => player.id));
  const outgoingIds = new Set<number>();
  const incomingIds = new Set<number>();
  for (const { outId, inId } of actions) {
    const outgoing = byId.get(outId);
    const incoming = byId.get(inId);
    if (!outgoing || !owned.has(outId))
      throw new Error("The outgoing player must belong to your squad.");
    if (settings.lockedPlayerIds?.includes(outId))
      throw new Error(
        `${outgoing.web_name} is locked. Unlock them to compare this transfer.`,
      );
    if (!incoming) throw new Error("Choose a valid incoming player.");
    if (owned.has(inId))
      throw new Error("The incoming player is already in your squad.");
    if (outgoingIds.has(outId) || incomingIds.has(inId))
      throw new Error("Each player can appear only once in a transfer batch.");
    if (!incoming.can_select || !incoming.can_transact)
      throw new Error("The incoming player is not available for transfers.");
    if (incoming.element_type !== outgoing.element_type)
      throw new Error("Choose players in the same position.");
    outgoingIds.add(outId);
    incomingIds.add(inId);
    bank += (prices.get(outId) ?? outgoing.now_cost) - incoming.now_cost;
  }
  if (bank < 0)
    throw new Error(
      "This transfer is unaffordable with your bank and selling prices.",
    );
  const replacements = new Map(
    actions.map((action) => [action.outId, byId.get(action.inId)!]),
  );
  const changed = squad.map((player) => replacements.get(player.id) ?? player);
  if (
    actions.length &&
    excessClubIds(changed, data.bootstrap.game_settings.squad_team_limit).length
  )
    throw new Error("This transfer exceeds the club player limit.");
  for (const { outId, inId } of actions) {
    prices.delete(outId);
    prices.set(inId, byId.get(inId)!.now_cost);
  }
  return { squad: changed, bank };
}

export function previewTransfers(
  data: Data,
  settings: Settings,
  actions: TransferAction[],
): Lineup[] {
  const context = transferContext(data, settings);
  const { weeks, scores } = context;
  if (actions.some((action) => !weeks.includes(action.week)))
    throw new Error("Choose a gameweek within the forecast horizon.");
  let squad = context.squad;
  let bank = settings.bank;
  const prices = new Map(
    settings.squad.map((pick) => [pick.id, pick.sellingPrice]),
  );
  return weeks.map((week, index) => {
    ({ squad, bank } = applyTransfers(
      data,
      settings,
      squad,
      prices,
      bank,
      actions.filter((action) => action.week === week),
    ));
    const lineup = bestLineup(data, squad, scores[index]);
    return { ...lineup, score: round(lineup.score) };
  });
}

export function evaluatePreparedTransfer(
  context: Context,
  outId: number,
  inId: number,
): { move: Move; lineups: Lineup[] } {
  const { data, settings, weeks, byId, squad, scores, baseline } = context;
  if (!weeks.length) throw new Error("No upcoming gameweeks are available.");
  const { squad: changed, bank: remainingBank } = applyTransfers(
    data,
    settings,
    squad,
    new Map(settings.squad.map((pick) => [pick.id, pick.sellingPrice])),
    settings.bank,
    [{ week: weeks[0], outId, inId }],
  );
  const outgoing = byId.get(outId)!;
  const incoming = byId.get(inId)!;
  const lineups = scores.map((values) => bestLineup(data, changed, values));
  const baselineTotal = baseline.reduce((sum, lineup) => sum + lineup.score, 0);
  const grossGain =
    lineups.reduce((sum, lineup) => sum + lineup.score, 0) - baselineTotal;
  const hit = settings.freeTransfers > 0 ? 0 : 4;
  const gain = grossGain - hit;
  const reasons = [
    `Changes the optimised starting XI and captain total by ${round(grossGain)} score units across ${weeks.length} gameweeks before the hit.`,
    `${Math.round(expectedMinutes(data, incoming))} estimated minutes per match from recent history where available, blended with season usage; venue and opponent strengths adjust attacking and clean-sheet scores.`,
  ];
  if (incoming.penalties_order === 1)
    reasons.push(
      "Listed first for penalties; this role is already reflected in underlying attacking data, so receives no extra bonus.",
    );
  if (
    incoming.corners_and_indirect_freekicks_order === 1 ||
    incoming.direct_freekicks_order === 1
  )
    reasons.push(
      "Listed first for a set-piece duty; role context, not an additional scoring bonus.",
    );
  if (availability(outgoing) < 1)
    reasons.push(
      `${outgoing.web_name}'s availability affects the keep score under the selected ${settings.availabilityScenario === "recover-next-week" ? "recovery from the second week" : "persistent absence"} scenario; no return date is inferred.`,
    );
  const move: Move = {
    outId,
    inId,
    cost: incoming.now_cost,
    remainingBank,
    hit,
    gain: round(gain),
    immediateGain: round(lineups[0].score - baseline[0].score - hit),
    grossGain: round(grossGain),
    reasons,
    risks: playerRisks(data, incoming, settings.availabilityScenario),
    fixtures: fixturesFor(data, incoming, weeks),
  };
  return {
    move,
    lineups: lineups.map((lineup) => ({
      ...lineup,
      score: round(lineup.score),
    })),
  };
}

export function addAvailabilitySensitivity(
  context: Context,
  moves: Move[],
): void {
  const { data, settings, weeks, squad, byId } = context;
  const selected = settings.availabilityScenario ?? "persistent";
  const alternate =
    selected === "persistent" ? "recover-next-week" : "persistent";
  const scores = weeks.map(
    (week) =>
      new Map(
        data.bootstrap.elements.map((player) => [
          player.id,
          scorePlayer(data, player, week, alternate),
        ]),
      ),
  );
  const baseline = scores.reduce(
    (sum, values) => sum + bestLineup(data, squad, values).score,
    0,
  );
  for (const move of moves) {
    const changed = squad.map((player) =>
      player.id === move.outId ? byId.get(move.inId)! : player,
    );
    const gain = round(
      scores.reduce(
        (sum, values) => sum + bestLineup(data, changed, values).score,
        0,
      ) -
        baseline -
        move.hit,
    );
    move.gainPersistent = selected === "persistent" ? move.gain : gain;
    move.gainRecovery = selected === "recover-next-week" ? move.gain : gain;
    if (Math.abs(move.gainPersistent - move.gainRecovery) >= 1)
      move.risks.push(
        `Availability-sensitive: net gain is ${move.gainPersistent} with persistent availability and ${move.gainRecovery} if flagged players recover from week two. These are scenarios, not confidence bounds.`,
      );
  }
}

export function evaluateTransfer(
  data: Data,
  settings: Settings,
  outId: number,
  inId: number,
): { move: Move; lineups: Lineup[] } {
  const context = transferContext(data, settings);
  const result = evaluatePreparedTransfer(context, outId, inId);
  addAvailabilitySensitivity(context, [result.move]);
  return result;
}
