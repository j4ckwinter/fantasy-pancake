import type { Data, Player, Settings } from "../schemas";
import { POSITIONS } from "../model/position";

const SQUAD_BUDGET = 1000;
const MAX_SAMPLING_ATTEMPTS = 50;
const OWNERSHIP_WEIGHT_POWER = 2;

export type Random = () => number;

export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function weightedPick(
  candidates: readonly Player[],
  weight: (player: Player) => number,
  random: Random,
): Player | undefined {
  const total = candidates.reduce((sum, player) => sum + weight(player), 0);
  if (total <= 0) return undefined;
  let target = random() * total;
  for (const player of candidates) {
    target -= weight(player);
    if (target < 0) return player;
  }
  return candidates.at(-1);
}

function sampleSquad(
  data: Data,
  ownership: ReadonlyMap<number, number>,
  random: Random,
): Player[] | undefined {
  const { element_types, game_settings } = data.bootstrap;
  const slots = POSITIONS.flatMap((position) =>
    Array.from<number>({
      length:
        element_types.find((type) => type.id === position)?.squad_select ?? 0,
    }).fill(position),
  );
  const pool = data.bootstrap.elements.filter(
    (player) => (ownership.get(player.id) ?? 0) > 0,
  );
  const cheapest = new Map<number, number>(
    POSITIONS.map((position) => [
      position,
      Math.min(
        ...pool
          .filter((player) => player.element_type === position)
          .map((player) => player.now_cost),
      ),
    ]),
  );
  const chosen: Player[] = [];
  let spent = 0;
  for (const [index, position] of slots.entries()) {
    const reserve = slots
      .slice(index + 1)
      .reduce((sum, later) => sum + (cheapest.get(later) ?? 0), 0);
    const candidates = pool.filter(
      (player) =>
        player.element_type === position &&
        !chosen.includes(player) &&
        chosen.filter((owned) => owned.team === player.team).length <
          game_settings.squad_team_limit &&
        spent + player.now_cost + reserve <= SQUAD_BUDGET,
    );
    const picked = weightedPick(
      candidates,
      (player) => (ownership.get(player.id) ?? 0) ** OWNERSHIP_WEIGHT_POWER,
      random,
    );
    if (!picked) return undefined;
    chosen.push(picked);
    spent += picked.now_cost;
  }
  return chosen;
}

export function sampleSettings(
  data: Data,
  ownership: ReadonlyMap<number, number>,
  count: number,
  random: Random,
): Settings[] {
  const squads: Settings[] = [];
  for (
    let attempt = 0;
    squads.length < count && attempt < count * MAX_SAMPLING_ATTEMPTS;
    attempt++
  ) {
    const squad = sampleSquad(data, ownership, random);
    if (!squad) continue;
    const cost = squad.reduce((sum, player) => sum + player.now_cost, 0);
    squads.push({
      version: 1,
      entryId: squads.length + 1,
      sourceGameweek:
        data.bootstrap.events.find((event) => event.is_current)?.id ?? 1,
      season: "backtest",
      bank: SQUAD_BUDGET - cost,
      freeTransfers: 1,
      squad: squad.map((player) => ({
        id: player.id,
        sellingPrice: player.now_cost,
      })),
    });
  }
  return squads;
}
