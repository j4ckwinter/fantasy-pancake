import { describe, expect, it } from "vitest";
import { analyze, previewTransfers, type TransferPlan } from "../model";
import { addPlayer, seasonContext } from "./test-fixtures";

const STRONG = { expected_goals: 12, expected_assists: 8 };

function planOfKind(plans: TransferPlan[], kind: TransferPlan["kind"]) {
  return plans.find((plan) => plan.kind === kind);
}

describe("bounded transfer planning", () => {
  it("uses combined sale proceeds for an otherwise unaffordable upgrade", () => {
    const { data, settings } = seasonContext();
    addPlayer(data, { element_type: 4, now_cost: 70, ...STRONG });
    addPlayer(data, {
      id: 101,
      element_type: 2,
      now_cost: 30,
      expected_goals: 1,
      expected_assists: 1,
    });
    const { plans, moves } = analyze(data, settings);
    const pair = planOfKind(plans!, "pair-now")!;
    expect(pair.actions.map((action) => action.inId).sort()).toEqual([
      100, 101,
    ]);
    expect(pair.remainingBank).toBe(0);
    expect(planOfKind(plans!, "roll-then-transfer")).toBeUndefined();
    expect(moves).toEqual([]);
  });

  it("charges each uncovered transfer once for zero, one and two free transfers", () => {
    const { data, settings } = seasonContext();
    addPlayer(data, { element_type: 4, ...STRONG });
    addPlayer(data, { id: 101, ...STRONG });
    const pairs = [0, 1, 2].map((freeTransfers) => {
      settings.freeTransfers = freeTransfers;
      return planOfKind(analyze(data, settings).plans!, "pair-now")!;
    });
    expect(pairs.map((plan) => plan.hit)).toEqual([8, 4, 0]);
    expect(pairs[0].gain).toBeCloseTo(pairs[2].gain - 8);
    expect(pairs[1].gain).toBeCloseTo(pairs[2].gain - 4);
    expect(pairs.map((plan) => plan.freeTransfersAfterPlan)).toEqual([0, 0, 0]);
  });

  it("rolls once before the delayed move, respects the cap, and excludes first-week gain", () => {
    const { data, settings } = seasonContext();
    addPlayer(data, { element_type: 4, ...STRONG });
    settings.freeTransfers = 0;
    const roll = planOfKind(
      analyze(data, settings).plans!,
      "roll-then-transfer",
    )!;
    expect(roll.actions[0].week).toBe(12);
    expect(roll.hit).toBe(0);
    expect(roll.freeTransfersAfterPlan).toBe(0);
    const kept = previewTransfers(data, settings, []);
    const deferred = previewTransfers(data, settings, roll.actions);
    expect(deferred[0]).toEqual(kept[0]);
    const laterGain = deferred
      .slice(1)
      .reduce(
        (sum, lineup, index) => sum + lineup.score - kept[index + 1].score,
        0,
      );
    expect(roll.gain).toBe(20.42);
    expect(roll.gain).toBeCloseTo(laterGain, 1);
    settings.freeTransfers = 5;
    const atCap = planOfKind(
      analyze(data, settings).plans!,
      "roll-then-transfer",
    )!;
    expect(atCap.freeTransfersAfterPlan).toBe(4);
  });

  it("keeps every resulting squad unique, in position, and within every club limit", () => {
    const { data, settings } = seasonContext();
    addPlayer(data, { team: 1, ...STRONG });
    addPlayer(data, { id: 101, element_type: 2, team: 1, ...STRONG });
    const { plans } = analyze(data, settings);
    expect(plans!.length).toBeGreaterThan(0);
    const byId = new Map(data.bootstrap.elements.map((p) => [p.id, p]));
    for (const plan of plans!) {
      const changed = settings.squad.map((pick) => {
        const action = plan.actions.find((a) => a.outId === pick.id);
        const incoming = byId.get(action ? action.inId : pick.id)!;
        expect(incoming.element_type).toBe(byId.get(pick.id)!.element_type);
        return incoming;
      });
      expect(new Set(changed.map((p) => p.id)).size).toBe(15);
      const clubCounts = new Map<number, number>();
      for (const p of changed)
        clubCounts.set(p.team, (clubCounts.get(p.team) ?? 0) + 1);
      expect(Math.max(...clubCounts.values())).toBeLessThanOrEqual(3);
      expect(new Set(plan.actions.map((a) => a.outId)).size).toBe(
        plan.actions.length,
      );
    }
  });

  it("does not invent a deferred week or choose unavailable transaction candidates", () => {
    const { data, settings } = seasonContext();
    const star = addPlayer(data, { element_type: 4, ...STRONG });
    star.can_transact = false;
    expect(analyze(data, settings).plans).toEqual([]);
    star.can_transact = true;
    addPlayer(data, { id: 101, ...STRONG });
    settings.freeTransfers = 2;
    data.bootstrap.events.forEach((event) => {
      event.is_next = event.id === 14;
    });
    const { weeks, plans } = analyze(data, settings);
    expect(weeks).toEqual([14]);
    expect(plans!.length).toBeGreaterThan(0);
    expect(planOfKind(plans!, "roll-then-transfer")).toBeUndefined();
  });
});
