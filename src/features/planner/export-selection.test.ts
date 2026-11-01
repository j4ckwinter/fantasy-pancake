import { expect, it } from "vitest";
import type { Analysis, Move, TransferPlan } from "../../lib/model";
import { includeSelectedOption } from "./export-selection";

const move: Move = {
  outId: 8,
  inId: 16,
  cost: 50,
  remainingBank: 5,
  hit: 0,
  gain: 1,
  immediateGain: 0,
  grossGain: 1,
  reasons: [],
  risks: [],
  fixtures: [],
};
const analysis: Analysis = {
  weeks: [9, 10],
  baseline: [],
  moves: [],
  plans: [],
  threshold: 2,
  rollReason: "Roll",
};
it("includes a selected below-threshold custom transfer without modifying the shortlist", () => {
  const result = includeSelectedOption(analysis, {
    key: "8-16",
    label: "Custom",
    custom: true,
    move,
    actions: [{ week: 9, outId: 8, inId: 16 }],
  });
  expect(result.moves).toEqual([move]);
  expect(analysis.moves).toEqual([]);
});
it("refreshes existing selection in place without duplicating or renumbering other options", () => {
  const other = { ...move, outId: 9 };
  const result = includeSelectedOption(
    { ...analysis, moves: [move, other] },
    {
      key: "8-16",
      label: "Selected",
      move: { ...move, remainingBank: 2 },
      actions: [{ week: 9, outId: 8, inId: 16 }],
    },
  );
  expect(result.moves).toEqual([{ ...move, remainingBank: 2 }, other]);
});
it("retains a selected deferred plan that no longer tops its category", () => {
  const plan: TransferPlan = {
    kind: "roll-then-transfer",
    actions: [{ week: 10, outId: 8, inId: 16 }],
    gain: 1,
    hit: 0,
    remainingBank: 5,
    freeTransfersAfterPlan: 1,
    reasons: [],
  };
  const best = {
    ...plan,
    actions: [{ week: 10, outId: 9, inId: 16 }],
    gain: 3,
  };
  const result = includeSelectedOption(
    { ...analysis, plans: [best] },
    { key: plan.kind, label: "Deferred", plan, actions: plan.actions },
  );
  expect(result.plans).toEqual([best, plan]);
});
