import type { Data, Player } from "../schemas";
import { bestLineup } from "./lineup";
import { POSITIONS, positionOf, type Position } from "./position";

const STARTERS_BY_POINTS = 8;
const STARTERS_BY_VALUE = 4;
const BEAM_WIDTH = 40;
const BENCH_UPGRADES_PER_POSITION = 10;
const BENCH_UPGRADE_PASSES = 3;

type SquadRules = {
  bootstrap: Pick<Data["bootstrap"], "element_types" | "game_settings">;
};

export type SquadMarket = {
  players: readonly Player[];
  prices: ReadonlyMap<number, number>;
  budget: number;
  kept: ReadonlySet<number>;
};

type Candidate = { player: Player; points: number; price: number };

type Pools = Record<
  Position,
  {
    starters: Candidate[];
    bench: Candidate[];
    upgrades: Candidate[];
    kept: Candidate[];
  }
>;

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

type WeeklyScores = readonly ReadonlyMap<number, number>[];

const pointsOver = (weeks: WeeklyScores, id: number) =>
  weeks.reduce((sum, week) => sum + (week.get(id) ?? 0), 0);

function pools(market: SquadMarket, weeks: WeeklyScores) {
  const candidates = market.players.flatMap((player): Candidate[] => {
    const price = market.prices.get(player.id);
    return price === undefined
      ? []
      : [{ player, price, points: pointsOver(weeks, player.id) }];
  });
  const forPosition = (position: Position) => {
    const inPosition = candidates.filter(
      (candidate) => positionOf(candidate.player) === position,
    );
    const eligible = inPosition.filter(
      (candidate) => !market.kept.has(candidate.player.id),
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
      upgrades: [...eligible]
        .sort(byPoints)
        .slice(0, BENCH_UPGRADES_PER_POSITION),
      kept: inPosition
        .filter((candidate) => market.kept.has(candidate.player.id))
        .sort(byPoints),
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

type Need = { position: Position; count: number };

type FormationPlan = {
  slots: Position[];
  benchNeeds: Need[];
  keptBench: Candidate[];
  start: Partial;
};

const EMPTY: Partial = {
  picks: [],
  points: 0,
  captain: 0,
  cost: 0,
  clubs: new Map(),
  lastIndex: -1,
};

function formationPlan(
  rules: SquadRules,
  formation: Formation,
  pool: Pools,
): FormationPlan | null {
  let start = EMPTY;
  const slots: Position[] = [];
  const benchNeeds: Need[] = [];
  const keptBench: Candidate[] = [];
  for (const position of POSITIONS) {
    const select = rules.bootstrap.element_types.find(
      (candidate) => candidate.id === position,
    )!.squad_select;
    const starting = formation.starters[position];
    const kept = pool[position].kept;
    const keptStarting = kept.slice(0, starting);
    const keptOnBench = kept.slice(starting);
    if (keptOnBench.length > select - starting) return null;
    for (const pick of keptStarting) start = withPick(start, pick, -1);
    keptBench.push(...keptOnBench);
    slots.push(
      ...Array<Position>(starting - keptStarting.length).fill(position),
    );
    benchNeeds.push({
      position,
      count: select - starting - keptOnBench.length,
    });
  }
  return { slots, benchNeeds, keptBench, start: { ...start, lastIndex: -1 } };
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
  plan: FormationPlan,
  pool: Pools,
  budget: number,
  clubLimit: number,
  benchFloor: number,
): Partial[] {
  const { slots } = plan;
  const floorAfter = slots.map((_, slot) =>
    POSITIONS.reduce((sum, position) => {
      const remaining = slots
        .slice(slot + 1)
        .filter((later) => later === position).length;
      return sum + cheapest(pool[position].starters, remaining);
    }, benchFloor),
  );
  let beam: Partial[] = [plan.start];
  slots.forEach((position, slot) => {
    const continuing = slot > 0 && slots[slot - 1] === position;
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
  plan: FormationPlan,
  pool: Pools,
  state: Partial,
  budget: number,
): Squad | null {
  const chosen = new Set(state.picks.map((pick) => pick.player.id));
  const clubs = new Map(state.clubs);
  const limit = rules.bootstrap.game_settings.squad_team_limit;
  let cost = state.cost;
  const bench: Player[] = [];
  for (const { player, price } of plan.keptBench) {
    if ((clubs.get(player.team) ?? 0) >= limit) return null;
    chosen.add(player.id);
    clubs.set(player.team, (clubs.get(player.team) ?? 0) + 1);
    cost += price;
    bench.push(player);
  }
  for (const { position, count } of plan.benchNeeds) {
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
  return { starters: state.picks.map((pick) => pick.player), bench };
}

type Squad = { starters: Player[]; bench: Player[] };

const membersOf = ({ starters, bench }: Squad) => [...starters, ...bench];

function squadScore(rules: SquadRules, squad: Squad, weeks: WeeklyScores) {
  const members = membersOf(squad);
  return weeks.reduce(
    (sum, week) => sum + bestLineup(rules, members, week).score,
    0,
  );
}

function upgradedBench(
  rules: SquadRules,
  pool: Pools,
  market: SquadMarket,
  squad: Squad,
  weeks: WeeklyScores,
): Squad {
  const limit = rules.bootstrap.game_settings.squad_team_limit;
  const priceOf = (player: Player) => market.prices.get(player.id) ?? 0;
  let current = { squad, score: squadScore(rules, squad, weeks) };
  for (let pass = 0; pass < BENCH_UPGRADE_PASSES; pass++) {
    const members = membersOf(current.squad);
    const ids = new Set(members.map((player) => player.id));
    const spent = members.reduce((sum, player) => sum + priceOf(player), 0);
    let improved = current;
    for (const [slot, outgoing] of current.squad.bench.entries()) {
      if (market.kept.has(outgoing.id)) continue;
      for (const { player: incoming, price } of pool[positionOf(outgoing)]
        .upgrades) {
        if (ids.has(incoming.id)) continue;
        if (spent - priceOf(outgoing) + price > market.budget) continue;
        const sameClub = members.filter(
          (player) => player.team === incoming.team && player !== outgoing,
        ).length;
        if (sameClub >= limit) continue;
        const bench = current.squad.bench.map((player, index) =>
          index === slot ? incoming : player,
        );
        const candidate = { starters: current.squad.starters, bench };
        const score = squadScore(rules, candidate, weeks);
        if (score > improved.score) improved = { squad: candidate, score };
      }
    }
    if (improved === current) break;
    current = improved;
  }
  return current.squad;
}

export function bestAffordableSquad(
  rules: SquadRules,
  market: SquadMarket,
  weeks: WeeklyScores,
): Player[] | null {
  const pool = pools(market, weeks);
  const clubLimit = rules.bootstrap.game_settings.squad_team_limit;
  let best: { squad: Squad; score: number } | null = null;
  for (const formation of formations(rules)) {
    const plan = formationPlan(rules, formation, pool);
    if (!plan) continue;
    const benchFloor =
      plan.keptBench.reduce((sum, candidate) => sum + candidate.price, 0) +
      plan.benchNeeds.reduce(
        (sum, { position, count }) =>
          sum + cheapest(pool[position].bench, count),
        0,
      );
    const finalists = searchStarters(
      plan,
      pool,
      market.budget,
      clubLimit,
      benchFloor,
    );
    for (const state of finalists) {
      const squad = withBench(rules, plan, pool, state, market.budget);
      if (!squad) continue;
      const score = squadScore(rules, squad, weeks);
      if (!best || score > best.score) best = { squad, score };
    }
  }
  if (!best) return null;
  return membersOf(
    weeks.length > 1
      ? upgradedBench(rules, pool, market, best.squad, weeks)
      : best.squad,
  );
}
