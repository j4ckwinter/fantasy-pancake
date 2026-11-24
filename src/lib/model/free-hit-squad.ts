import type { Data, Player } from "../schemas";
import { bestLineup } from "./lineup";
import { POSITIONS, positionOf, type Position } from "./position";

const STARTERS_BY_POINTS = 8;
const STARTERS_BY_VALUE = 4;
const BEAM_WIDTH = 40;

type SquadRules = {
  bootstrap: Pick<Data["bootstrap"], "element_types" | "game_settings">;
};

export type FreeHitMarket = {
  players: readonly Player[];
  prices: ReadonlyMap<number, number>;
  budget: number;
};

type Candidate = { player: Player; points: number; price: number };

type Pools = Record<Position, { starters: Candidate[]; bench: Candidate[] }>;

type Partial = {
  picks: Candidate[];
  points: number;
  captain: number;
  cost: number;
  clubs: ReadonlyMap<number, number>;
  lastIndex: number;
};

type Formation = { starters: Record<Position, number>; slots: Position[] };

const byPoints = (a: Candidate, b: Candidate) =>
  b.points - a.points || a.player.id - b.player.id;
const byValue = (a: Candidate, b: Candidate) =>
  b.points / Math.max(1, b.price) - a.points / Math.max(1, a.price) ||
  byPoints(a, b);
const byPrice = (a: Candidate, b: Candidate) =>
  a.price - b.price || byPoints(a, b);

function pools(market: FreeHitMarket, scores: ReadonlyMap<number, number>) {
  const candidates = market.players.flatMap((player): Candidate[] => {
    const price = market.prices.get(player.id);
    return price === undefined
      ? []
      : [{ player, price, points: scores.get(player.id) ?? 0 }];
  });
  const forPosition = (position: Position) => {
    const eligible = candidates.filter(
      (candidate) => positionOf(candidate.player) === position,
    );
    const starters = new Map(
      [
        ...[...eligible].sort(byPoints).slice(0, STARTERS_BY_POINTS),
        ...[...eligible].sort(byValue).slice(0, STARTERS_BY_VALUE),
      ].map((candidate) => [candidate.player.id, candidate]),
    );
    return {
      starters: [...starters.values()].sort(byPoints),
      bench: [...eligible].sort(byPrice),
    };
  };
  return {
    1: forPosition(1),
    2: forPosition(2),
    3: forPosition(3),
    4: forPosition(4),
  } satisfies Pools;
}

function formations(rules: SquadRules): Formation[] {
  const { element_types, game_settings } = rules.bootstrap;
  const limits = POSITIONS.map((position) => {
    const type = element_types.find((candidate) => candidate.id === position);
    if (!type) throw new Error("Position rules are unavailable.");
    return type;
  });
  const found: Formation[] = [];
  const choose = (index: number, counts: number[]) => {
    if (index === POSITIONS.length) {
      const total = counts.reduce((sum, count) => sum + count, 0);
      if (total !== game_settings.squad_squadplay) return;
      const starters = {
        1: counts[0],
        2: counts[1],
        3: counts[2],
        4: counts[3],
      };
      found.push({
        starters,
        slots: POSITIONS.flatMap((position, i) =>
          Array<Position>(counts[i]).fill(position),
        ),
      });
      return;
    }
    const { squad_min_play, squad_max_play } = limits[index];
    for (let count = squad_min_play; count <= squad_max_play; count++)
      choose(index + 1, [...counts, count]);
  };
  choose(0, []);
  return found;
}

function benchNeeds(rules: SquadRules, formation: Formation) {
  return POSITIONS.map((position) => {
    const type = rules.bootstrap.element_types.find(
      (candidate) => candidate.id === position,
    )!;
    return {
      position,
      count: type.squad_select - formation.starters[position],
    };
  });
}

function cheapest(candidates: Candidate[], count: number) {
  return [...candidates]
    .sort(byPrice)
    .slice(0, count)
    .reduce((sum, candidate) => sum + candidate.price, 0);
}

function withPick(state: Partial, pick: Candidate, index: number): Partial {
  const club = pick.player.team;
  const clubs = new Map(state.clubs);
  clubs.set(club, (clubs.get(club) ?? 0) + 1);
  return {
    picks: [...state.picks, pick],
    points: state.points + pick.points,
    captain: Math.max(state.captain, pick.points),
    cost: state.cost + pick.price,
    clubs,
    lastIndex: index,
  };
}

function searchStarters(
  formation: Formation,
  pool: Pools,
  budget: number,
  clubLimit: number,
  benchFloor: number,
): Partial[] {
  const floorAfter = formation.slots.map((_, slot) =>
    POSITIONS.reduce((sum, position) => {
      const remaining = formation.slots
        .slice(slot + 1)
        .filter((later) => later === position).length;
      return sum + cheapest(pool[position].starters, remaining);
    }, benchFloor),
  );
  let beam: Partial[] = [
    {
      picks: [],
      points: 0,
      captain: 0,
      cost: 0,
      clubs: new Map(),
      lastIndex: -1,
    },
  ];
  formation.slots.forEach((position, slot) => {
    const continuing = slot > 0 && formation.slots[slot - 1] === position;
    const next: Partial[] = [];
    for (const state of beam) {
      const from = continuing ? state.lastIndex + 1 : 0;
      const starters = pool[position].starters;
      for (let index = from; index < starters.length; index++) {
        const pick = starters[index];
        if ((state.clubs.get(pick.player.team) ?? 0) >= clubLimit) continue;
        if (state.cost + pick.price + floorAfter[slot] > budget) continue;
        next.push(withPick(state, pick, index));
      }
    }
    beam = next
      .sort(
        (a, b) =>
          b.points + b.captain - (a.points + a.captain) || a.cost - b.cost,
      )
      .slice(0, BEAM_WIDTH);
  });
  return beam;
}

function withBench(
  rules: SquadRules,
  formation: Formation,
  pool: Pools,
  state: Partial,
  budget: number,
): Player[] | null {
  const chosen = new Set(state.picks.map((pick) => pick.player.id));
  const clubs = new Map(state.clubs);
  const limit = rules.bootstrap.game_settings.squad_team_limit;
  let cost = state.cost;
  const bench: Player[] = [];
  for (const { position, count } of benchNeeds(rules, formation)) {
    let needed = count;
    for (const candidate of pool[position].bench) {
      if (!needed) break;
      const club = candidate.player.team;
      if (chosen.has(candidate.player.id) || (clubs.get(club) ?? 0) >= limit)
        continue;
      chosen.add(candidate.player.id);
      clubs.set(club, (clubs.get(club) ?? 0) + 1);
      cost += candidate.price;
      bench.push(candidate.player);
      needed--;
    }
    if (needed) return null;
  }
  if (cost > budget) return null;
  return [...state.picks.map((pick) => pick.player), ...bench];
}

export function bestFreeHitSquad(
  rules: SquadRules,
  market: FreeHitMarket,
  scores: ReadonlyMap<number, number>,
): Player[] | null {
  const pool = pools(market, scores);
  const clubLimit = rules.bootstrap.game_settings.squad_team_limit;
  let best: { squad: Player[]; score: number } | null = null;
  for (const formation of formations(rules)) {
    const benchFloor = benchNeeds(rules, formation).reduce(
      (sum, { position, count }) => sum + cheapest(pool[position].bench, count),
      0,
    );
    const finalists = searchStarters(
      formation,
      pool,
      market.budget,
      clubLimit,
      benchFloor,
    );
    for (const state of finalists) {
      const squad = withBench(rules, formation, pool, state, market.budget);
      if (!squad) continue;
      const score = bestLineup(rules, squad, scores).score;
      if (!best || score > best.score) best = { squad, score };
    }
  }
  return best?.squad ?? null;
}
