import { describe, expect, it } from "vitest";
import type { TransferPlan } from "./types";
import { chipPath } from "./chip-paths";
import { transferContext } from "./transfer-preview";
import { seasonContext } from "./test-fixtures";

function recommendedPlan(weeks: number[], firstWeekHit: number): TransferPlan {
  return {
    kind: "plan-ahead",
    variant: "best",
    actions: [],
    weeks: weeks.map((week, index) => ({
      week,
      actions: [],
      hit: index === 0 ? firstWeekHit : 0,
      freeTransfersBefore: 1,
      freeTransfersAfter: 1,
      bank: 0,
      score: 0,
      gain: 0,
    })),
    gain: 0,
    hit: firstWeekHit,
    remainingBank: 0,
    freeTransfersAfterPlan: 1,
    reasons: [],
  };
}

describe("chip paths", () => {
  it("keeps the plan's hit in a Free Hit week, since the plan's moves still happen after it", () => {
    const { data, settings } = seasonContext();
    const context = transferContext(data, settings);
    const freeHitFirstWeek = [
      { chip: "freehit" as const, week: context.weeks[0] },
    ];
    const withoutHit = chipPath(context, [
      recommendedPlan(context.weeks, 0),
    ]).evaluate(freeHitFirstWeek);
    const withHit = chipPath(context, [
      recommendedPlan(context.weeks, 4),
    ]).evaluate(freeHitFirstWeek);
    expect(withHit!.gain).toBeCloseTo(withoutHit!.gain, 9);
  });
});
