import { describe, expect, it } from "vitest";
import {
  analyze,
  evaluatePlan,
  freeTransferCap,
  previewTransfers,
  TRANSFER_HIT_POINTS,
  type TransferPlan,
} from "../model";
import type { Data } from "../schemas";
import { addPlayer, seasonContext } from "./test-fixtures";

const STRONG = { expected_goals: 12, expected_assists: 8 };

function planAhead(plans: TransferPlan[]) {
  return plans.filter((plan) => plan.kind === "plan-ahead");
}

function recommended(plans: TransferPlan[]) {
  const [best] = planAhead(plans);
  if (best?.kind !== "plan-ahead" || best.variant !== "best")
    throw new Error("No recommended plan.");
  return best;
}

function blankClub(data: Data, team: number, week: number) {
  data.fixtures = data.fixtures.filter(
    (fixture) =>
      fixture.event !== week ||
      (fixture.team_h !== team && fixture.team_a !== team),
  );
}

describe("planning ahead", () => {
  it("banks a free transfer to make two free moves when both stars blank first", () => {
    const { data, settings } = seasonContext();
    addPlayer(data, { team: 6, ...STRONG });
    addPlayer(data, { id: 101, element_type: 4, team: 6, ...STRONG });
    blankClub(data, 6, 11);
    const best = recommended(analyze(data, settings).plans);
    expect(best.weeks[0]).toMatchObject({
      week: 11,
      actions: [],
      freeTransfersBefore: 1,
    });
    expect(best.weeks[1]).toMatchObject({
      week: 12,
      freeTransfersBefore: 2,
      freeTransfersAfter: 0,
      hit: 0,
    });
    expect(best.weeks[1].actions.map((action) => action.inId).sort()).toEqual([
      100, 101,
    ]);
    expect(best.hit).toBe(0);
  });

  it("charges a hit only on transfers beyond the free ones, week by week, from zero free transfers", () => {
    const { data, settings } = seasonContext();
    addPlayer(data, { element_type: 4, ...STRONG });
    addPlayer(data, { id: 101, ...STRONG });
    settings.freeTransfers = 0;
    const cap = freeTransferCap(data.bootstrap.game_settings);
    for (const plan of analyze(data, settings).plans) {
      let free = settings.freeTransfers;
      for (const week of plan.weeks) {
        expect(week.freeTransfersBefore).toBe(free);
        expect(week.hit).toBe(
          TRANSFER_HIT_POINTS * Math.max(0, week.actions.length - free),
        );
        free = Math.min(cap, Math.max(0, free - week.actions.length) + 1);
      }
      expect(plan.hit).toBe(plan.weeks.reduce((sum, w) => sum + w.hit, 0));
    }
  });

  it("keeps the free-transfer cap while holding and spends from it without hits", () => {
    const { data, settings } = seasonContext();
    addPlayer(data, { team: 6, ...STRONG });
    addPlayer(data, { id: 101, element_type: 4, team: 6, ...STRONG });
    blankClub(data, 6, 11);
    const cap = freeTransferCap(data.bootstrap.game_settings);
    settings.freeTransfers = cap;
    const best = recommended(analyze(data, settings).plans);
    expect(best.weeks.slice(0, 2).map((w) => w.freeTransfersBefore)).toEqual([
      cap,
      cap,
    ]);
    for (const week of best.weeks)
      expect(week.freeTransfersBefore).toBeLessThanOrEqual(cap);
    expect(best.actions.map((action) => action.inId).sort()).toEqual([
      100, 101,
    ]);
    expect(best.hit).toBe(0);
  });

  it("buys a double-gameweek player in time and never pays for a blank week", () => {
    const { data, settings } = seasonContext();
    addPlayer(data, { team: 6, ...STRONG });
    blankClub(data, 6, 11);
    data.fixtures.push({
      ...data.fixtures.find(
        (fixture) => fixture.event === 12 && fixture.team_h === 6,
      )!,
      id: 999,
    });
    const best = recommended(analyze(data, settings).plans);
    expect(best.actions).toEqual([
      expect.objectContaining({ week: 12, inId: 100 }),
    ]);
    expect(best.weeks[0].gain).toBe(0);
    expect(best.weeks[1].gain).toBeGreaterThan(best.weeks[2].gain);
  });

  it("never sells a locked player in any week", () => {
    const { data, settings } = seasonContext();
    addPlayer(data, STRONG);
    addPlayer(data, { id: 101, element_type: 4, ...STRONG });
    settings.lockedPlayerIds = [8, 9, 10, 11, 13, 14];
    const plans = planAhead(analyze(data, settings).plans);
    expect(plans.length).toBeGreaterThan(0);
    for (const plan of plans)
      for (const action of plan.actions)
        expect(settings.lockedPlayerIds).not.toContain(action.outId);
  });

  it("funds an unaffordable upgrade from a downgrade and keeps every week's bank non-negative", () => {
    const { data, settings } = seasonContext();
    addPlayer(data, { element_type: 4, now_cost: 70, ...STRONG });
    addPlayer(data, {
      id: 101,
      element_type: 2,
      now_cost: 30,
      expected_goals: 1,
      expected_assists: 1,
    });
    const best = recommended(analyze(data, settings).plans);
    expect(best.actions.map((action) => action.inId)).toContain(100);
    for (const week of best.weeks) expect(week.bank).toBeGreaterThanOrEqual(0);
    expect(best.remainingBank).toBe(0);
  });

  it("restores the club limit in every week it moves", () => {
    const { data, settings } = seasonContext();
    addPlayer(data, { team: 1, ...STRONG });
    addPlayer(data, { id: 101, element_type: 2, team: 1, ...STRONG });
    const byId = new Map(data.bootstrap.elements.map((p) => [p.id, p]));
    for (const plan of planAhead(analyze(data, settings).plans)) {
      let squad = settings.squad.map((pick) => pick.id);
      for (const week of plan.weeks) {
        for (const action of week.actions)
          squad = squad.map((id) => (id === action.outId ? action.inId : id));
        const fromClubOne = squad.filter((id) => byId.get(id)!.team === 1);
        expect(fromClubOne.length).toBeLessThanOrEqual(3);
      }
    }
  });

  it("offers no plan when nothing beats holding by the per-transfer margin", () => {
    const { data, settings } = seasonContext();
    addPlayer(data, { expected_goals: 1, expected_assists: 1 });
    expect(planAhead(analyze(data, settings).plans)).toEqual([]);
  });

  it("reports a gain that matches the previewed lineups less the hits", () => {
    const { data, settings } = seasonContext();
    addPlayer(data, { element_type: 4, ...STRONG });
    addPlayer(data, { id: 101, ...STRONG });
    settings.freeTransfers = 0;
    const result = analyze(data, settings);
    const holding = result.baseline.reduce((sum, l) => sum + l.score, 0);
    for (const plan of result.plans) {
      const previewed = previewTransfers(data, settings, plan.actions);
      const total = previewed.reduce((sum, lineup) => sum + lineup.score, 0);
      expect(plan.gain).toBeCloseTo(total - holding - plan.hit, 1);
      expect(plan.weeks.map((week) => week.score)).toEqual(
        previewed.map((lineup) => lineup.score),
      );
    }
  });

  it("names distinct alternatives and states its bounds, fixed prices and ignored news", () => {
    const { data, settings } = seasonContext();
    addPlayer(data, { element_type: 4, ...STRONG });
    addPlayer(data, { id: 101, ...STRONG });
    addPlayer(data, { id: 102, element_type: 2, ...STRONG });
    settings.freeTransfers = 0;
    const plans = planAhead(analyze(data, settings).plans);
    const variants = plans.map((plan) =>
      plan.kind === "plan-ahead" ? plan.variant : null,
    );
    expect(variants[0]).toBe("best");
    expect(new Set(variants).size).toBe(variants.length);
    const transferSets = plans.map((plan) =>
      plan.actions
        .map((action) => `${action.week}:${action.outId}>${action.inId}`)
        .sort()
        .join(),
    );
    expect(new Set(transferSets).size).toBe(plans.length);
    const reasons = plans[0].reasons.join(" ");
    expect(reasons).toContain("Bounded search");
    expect(reasons).toContain("today's purchase and selling prices");
    expect(reasons).toContain("Ignores future injury news");
    expect(reasons).toContain("each hit must clear that margin again");
  });

  it("re-evaluates a chosen plan after a selling price changes", () => {
    const { data, settings } = seasonContext();
    addPlayer(data, { element_type: 4, ...STRONG });
    settings.bank = 10;
    const best = recommended(analyze(data, settings).plans);
    const [action] = best.actions;
    const cheaper = {
      ...settings,
      squad: settings.squad.map((pick) =>
        pick.id === action.outId ? { ...pick, sellingPrice: 45 } : pick,
      ),
    };
    const updated = evaluatePlan(data, cheaper, best);
    expect(updated.remainingBank).toBe(best.remainingBank - 5);
    expect(updated.weeks.at(-1)!.bank).toBe(updated.remainingBank);
    expect(updated.actions).toEqual(best.actions);
  });
});
