import { describe, expect, it } from "vitest";
import type { Analysis, Move, TransferPlan } from "@/lib/model";
import type { Settings } from "@/lib/schemas";
import { planSelection, reselect, transferSelection } from "./selection";
import { seasonData } from "./test-fixtures";

const data = seasonData();
const players = data.bootstrap.elements;
const settings = {} as Settings;

function move(outId: number, inId: number, gain = 3): Move {
  return {
    outId,
    inId,
    cost: 0,
    remainingBank: 0,
    hit: 0,
    gain,
    immediateGain: gain,
    grossGain: gain,
    reasons: [],
    risks: [],
    fixtures: [],
  };
}

function plan(week: number, gain = 4): TransferPlan {
  return {
    kind: "roll-then-transfer",
    actions: [{ week, outId: 8, inId: 16 }],
    gain,
    hit: 0,
    remainingBank: 0,
    freeTransfersAfterPlan: 1,
    reasons: [],
  };
}

function analysis(overrides: Partial<Analysis>): Analysis {
  return {
    weeks: [10, 11, 12],
    baseline: [],
    moves: [],
    plans: [],
    threshold: 2,
    rollReason: "",
    ...overrides,
  };
}

describe("reselecting after a refresh", () => {
  it("keeps a shortlisted move with its refreshed numbers and week", () => {
    const previous = transferSelection(players, 9, move(8, 16), false);
    const refreshed = move(8, 16, 5);
    expect(
      reselect(previous, analysis({ moves: [refreshed] }), data, settings),
    ).toEqual(transferSelection(players, 10, refreshed, false));
  });

  it("drops a shortlisted move that left the shortlist", () => {
    const previous = transferSelection(players, 9, move(8, 16), false);
    expect(
      reselect(previous, analysis({ moves: [move(9, 16)] }), data, settings),
    ).toBeNull();
  });

  it("keeps a plan whose transfers survive even when its week moves on", () => {
    const refreshed = plan(11, 6);
    expect(
      reselect(
        planSelection(plan(10)),
        analysis({ plans: [refreshed] }),
        data,
        settings,
      ),
    ).toEqual(planSelection(refreshed));
  });

  it("drops a plan whose transfers changed", () => {
    const changed = {
      ...plan(10),
      actions: [{ week: 10, outId: 9, inId: 16 }],
    };
    expect(
      reselect(
        planSelection(plan(10)),
        analysis({ plans: [changed] }),
        data,
        settings,
      ),
    ).toBeNull();
  });

  it("selects nothing when the horizon is empty", () => {
    expect(
      reselect(
        planSelection(plan(10)),
        analysis({ weeks: [], plans: [plan(10)] }),
        data,
        settings,
      ),
    ).toBeNull();
  });
});
