import { describe, expect, it } from "vitest";
import {
  analyze,
  bestLineup,
  freeTransferCap,
  netGainThreshold,
  scorePlayer,
  TRANSFER_HIT_POINTS,
  type TransferAction,
  type TransferPlan,
} from "../model";
import type { Data, Player, Settings } from "../schemas";
import {
  addPlayer,
  seasonContext,
  seededRandom,
  syntheticLeague,
  syntheticSquad,
  type Random,
} from "./test-fixtures";

const GENERATED_CASES = 40;
const GENERATED_PLAYERS = 220;
const EXHAUSTIVE_CASES = 20;
const SQUAD_COUNTS: Record<number, number> = { 1: 2, 2: 5, 3: 5, 4: 3 };

function generatedCase(seed: number) {
  const random = seededRandom(seed);
  const data = syntheticLeague(seed, {
    players: GENERATED_PLAYERS,
    blankAndDouble: seed % 2 === 0,
  });
  const settings = syntheticSquad(data, random, {
    budget: 900 + Math.floor(random() * 150),
  });
  settings.freeTransfers = Math.floor(
    random() * (freeTransferCap(data.bootstrap.game_settings) + 1),
  );
  settings.lockedPlayerIds = settings.squad
    .filter(() => random() < 0.15)
    .map((pick) => pick.id);
  return { data, settings };
}

function freeTransferCost(transfers: number, free: number) {
  return TRANSFER_HIT_POINTS * Math.max(0, transfers - free);
}

function expectLegalEveryWeek(
  data: Data,
  settings: Settings,
  plan: TransferPlan,
) {
  const byId = new Map(data.bootstrap.elements.map((p) => [p.id, p]));
  const cap = freeTransferCap(data.bootstrap.game_settings);
  const limit = data.bootstrap.game_settings.squad_team_limit;
  const selling = new Map(settings.squad.map((p) => [p.id, p.sellingPrice]));
  let squad = settings.squad.map((pick) => pick.id);
  let bank = settings.bank;
  let free = settings.freeTransfers;
  let hits = 0;
  expect(plan.weeks.flatMap((week) => week.actions)).toEqual(plan.actions);
  for (const week of plan.weeks) {
    expect(week.freeTransfersBefore).toBe(free);
    expect(week.actions.length).toBeLessThanOrEqual(2);
    for (const { outId, inId } of week.actions) {
      expect(squad).toContain(outId);
      expect(squad).not.toContain(inId);
      expect(settings.lockedPlayerIds ?? []).not.toContain(outId);
      const incoming = byId.get(inId)!;
      expect(incoming.can_select && incoming.can_transact).toBe(true);
      expect(incoming.element_type).toBe(byId.get(outId)!.element_type);
      bank +=
        (selling.get(outId) ?? byId.get(outId)!.now_cost) - incoming.now_cost;
      selling.delete(outId);
      selling.set(inId, incoming.now_cost);
      squad = squad.map((id) => (id === outId ? inId : id));
    }
    expect(bank).toBeGreaterThanOrEqual(0);
    expect(week.bank).toBe(bank);
    expect(new Set(squad).size).toBe(15);
    for (const [position, count] of Object.entries(SQUAD_COUNTS))
      expect(
        squad.filter((id) => byId.get(id)!.element_type === Number(position)),
      ).toHaveLength(count);
    const clubs = new Map<number, number>();
    for (const id of squad)
      clubs.set(byId.get(id)!.team, (clubs.get(byId.get(id)!.team) ?? 0) + 1);
    if (plan.weeks.some((w) => w.week <= week.week && w.actions.length))
      expect(Math.max(...clubs.values())).toBeLessThanOrEqual(limit);
    const hit = freeTransferCost(week.actions.length, free);
    expect(week.hit).toBe(hit);
    hits += hit;
    free = Math.min(cap, Math.max(0, free - week.actions.length) + 1);
  }
  expect(plan.hit).toBe(hits);
  expect(plan.remainingBank).toBe(bank);
}

describe("plan properties over generated squads", () => {
  it("returns only plans that are legal every week, account hits correctly and beat holding", () => {
    let planCount = 0;
    for (let seed = 1; seed <= GENERATED_CASES; seed++) {
      const { data, settings } = generatedCase(seed);
      const result = analyze(data, settings);
      const holding = result.baseline.reduce((sum, l) => sum + l.score, 0);
      for (const plan of result.plans) {
        planCount++;
        expectLegalEveryWeek(data, settings, plan);
        expect(plan.gain).toBeGreaterThan(0);
        const total = plan.weeks.reduce((sum, week) => sum + week.score, 0);
        expect(plan.gain).toBeCloseTo(total - holding - plan.hit, 1);
      }
    }
    expect(planCount).toBeGreaterThan(GENERATED_CASES);
  });
});

function playersMovedEachWeek(plan: TransferPlan) {
  return plan.weeks
    .filter((week) => week.actions.length)
    .map((week) => {
      const ids = (pick: (action: TransferAction) => number) =>
        week.actions.map(pick).sort((a, b) => a - b);
      return JSON.stringify([
        week.week,
        ids((a) => a.outId),
        ids((a) => a.inId),
      ]);
    })
    .join();
}

describe("plan identity", () => {
  it("does not depend on the order of the squad", () => {
    for (let seed = 1; seed <= GENERATED_CASES; seed++) {
      const { data, settings } = generatedCase(seed);
      const reversed = { ...settings, squad: [...settings.squad].reverse() };
      expect(analyze(data, reversed).plans, `seed ${seed}`).toEqual(
        analyze(data, settings).plans,
      );
    }
  });

  it("never offers two plans that move the same players in the same weeks", () => {
    for (let seed = 1; seed <= GENERATED_CASES; seed++) {
      const { data, settings } = generatedCase(seed);
      const planAhead = analyze(data, settings).plans.filter(
        (plan) => plan.kind === "plan-ahead",
      );
      const moved = planAhead.map(playersMovedEachWeek);
      expect(new Set(moved).size, `seed ${seed}`).toBe(moved.length);
    }
  });
});

type Swap = Pick<TransferAction, "outId" | "inId">;

function scoresFor(data: Data, weeks: number[]) {
  return weeks.map(
    (week) =>
      new Map(
        data.bootstrap.elements.map((p) => [p.id, scorePlayer(data, p, week)]),
      ),
  );
}

function legalBatches(
  data: Data,
  squad: Player[],
  bank: number,
  locked: number[],
): { swaps: Swap[]; squad: Player[]; bank: number }[] {
  const market = data.bootstrap.elements.filter(
    (p) => !squad.includes(p) && p.can_select && p.can_transact,
  );
  const singles = squad.flatMap((out) =>
    locked.includes(out.id)
      ? []
      : market
          .filter((p) => p.element_type === out.element_type)
          .map((incoming) => ({ out, incoming })),
  );
  const batches = [
    [],
    ...singles.map((single) => [single]),
    ...singles.flatMap((first, index) =>
      singles
        .slice(index + 1)
        .filter(
          (second) =>
            second.out !== first.out && second.incoming !== first.incoming,
        )
        .map((second) => [first, second]),
    ),
  ];
  return batches.flatMap((batch) => {
    const next = squad.map(
      (p) => batch.find((swap) => swap.out === p)?.incoming ?? p,
    );
    const nextBank =
      bank +
      batch.reduce((sum, s) => sum + s.out.now_cost - s.incoming.now_cost, 0);
    const clubs = new Map<number, number>();
    for (const p of next) clubs.set(p.team, (clubs.get(p.team) ?? 0) + 1);
    const clubsOk =
      !batch.length ||
      Math.max(...clubs.values()) <=
        data.bootstrap.game_settings.squad_team_limit;
    return nextBank >= 0 && clubsOk
      ? [
          {
            swaps: batch.map((s) => ({ outId: s.out.id, inId: s.incoming.id })),
            squad: next,
            bank: nextBank,
          },
        ]
      : [];
  });
}

function margin(data: Data, settings: Settings) {
  return (transfers: number, free: number) =>
    netGainThreshold(data, { ...settings, freeTransfers: free }) *
    (transfers + Math.max(0, transfers - free));
}

function exhaustiveBest(data: Data, settings: Settings, weeks: number[]) {
  const scores = scoresFor(data, weeks);
  const cap = freeTransferCap(data.bootstrap.game_settings);
  const marginOf = margin(data, settings);
  const byId = new Map(data.bootstrap.elements.map((p) => [p.id, p]));
  const start = settings.squad.map((pick) => byId.get(pick.id)!);
  const holding = scores.reduce(
    (sum, week) => sum + bestLineup(data, start, week).score,
    0,
  );
  let best = 0;
  const visit = (
    index: number,
    squad: Player[],
    bank: number,
    free: number,
    value: number,
  ) => {
    if (index === weeks.length) {
      best = Math.max(best, value - holding);
      return;
    }
    for (const batch of legalBatches(
      data,
      squad,
      bank,
      settings.lockedPlayerIds ?? [],
    )) {
      const k = batch.swaps.length;
      const week = bestLineup(data, batch.squad, scores[index]).score;
      visit(
        index + 1,
        batch.squad,
        batch.bank,
        Math.min(cap, Math.max(0, free - k) + 1),
        value + week - freeTransferCost(k, free) - marginOf(k, free),
      );
    }
  };
  visit(0, start, settings.bank, settings.freeTransfers, 0);
  return best;
}

function smallMarket(random: Random) {
  const { data, settings } = seasonContext();
  data.bootstrap.events.forEach((event) => {
    event.is_next = event.id === 12;
  });
  for (const [index, position] of [2 + Math.floor(random() * 3), 4].entries())
    addPlayer(data, {
      id: 100 + index,
      element_type: position,
      team: 6 + Math.floor(random() * 2),
      now_cost: 40 + Math.floor(random() * 25),
      expected_goals: 3 + Math.round(random() * 9),
      expected_assists: Math.round(random() * 6),
    });
  settings.bank = Math.floor(random() * 15);
  settings.freeTransfers = Math.floor(random() * 3);
  return { data, settings };
}

describe("beam search against exhaustive search", () => {
  it("finds the exhaustive optimum on small markets", () => {
    for (let seed = 1; seed <= EXHAUSTIVE_CASES; seed++) {
      const { data, settings } = smallMarket(seededRandom(seed));
      const result = analyze(data, settings);
      const optimum = exhaustiveBest(data, settings, result.weeks);
      const [best] = result.plans.filter((plan) => plan.kind === "plan-ahead");
      const marginOf = margin(data, settings);
      const adjusted = best
        ? best.gain -
          best.weeks.reduce(
            (sum, week) =>
              sum + marginOf(week.actions.length, week.freeTransfersBefore),
            0,
          )
        : 0;
      expect(adjusted, `seed ${seed}`).toBeCloseTo(optimum, 1);
    }
  });
});
