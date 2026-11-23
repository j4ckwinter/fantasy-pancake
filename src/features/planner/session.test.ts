import { describe, expect, it } from "vitest";
import type { Analysis } from "@/lib/model";
import type { Settings } from "@/lib/schemas";
import { initialSession, sessionReducer, type Session } from "./session";
import { planSelection, transferSelection } from "./selection";

const settings: Settings = {
  version: 1,
  entryId: 123,
  sourceGameweek: 8,
  season: "2026",
  bank: 5,
  freeTransfers: 1,
  squad: Array.from({ length: 15 }, (_, i) => ({
    id: i + 1,
    sellingPrice: 50,
  })),
};

function analysis(weeks: number[]): Analysis {
  return {
    weeks,
    baseline: weeks.map(() => ({ ids: [], captain: 1, score: 0 })),
    captaincy: [],
    moves: [],
    plans: [],
    threshold: 2,
    rollReason: "",
    chips: { status: "unknown", missing: "played-chips" },
  };
}

function session(overrides: Partial<Session> = {}): Session {
  return {
    ...initialSession,
    settings,
    teamId: "123",
    result: analysis([9, 10, 11, 12]),
    ...overrides,
  };
}

describe("planner session", () => {
  it("switching team forgets the previous team's errors and messages", () => {
    const next = sessionReducer(
      session({
        error: "Too many players from Team 1.",
        customError: "Could not compare this transfer.",
        priceConfirmed: true,
        lineupIndex: 3,
        planCategory: "pair-now",
      }),
      { type: "team-switched" },
    );
    expect(next).toEqual({ ...initialSession, teamId: "123" });
  });

  it("leaves squad problems to the team review instead of the error banner", () => {
    const next = sessionReducer(session({ settings: null, result: null }), {
      type: "imported",
      teamId: "123",
      settings,
      result: null,
      freeHit: false,
    });
    expect(next.error).toBe("");
    expect(next.reviewOpen).toBe(true);
  });

  it("drops the price confirmation once the user moves on", () => {
    const confirmed = session({ priceConfirmed: true });
    const plan = {
      kind: "pair-now" as const,
      actions: [],
      gain: 3,
      hit: 0,
      remainingBank: 0,
      freeTransfersAfterPlan: 0,
      reasons: [],
      weeks: [],
    };
    const moves = [
      { type: "selected", selection: planSelection(plan) },
      { type: "selection-cleared" },
      { type: "evaluated", settings, result: analysis([9]) },
      { type: "settings-edited", settings },
    ] as const;
    for (const action of moves)
      expect(sessionReducer(confirmed, action).priceConfirmed).toBe(false);
  });

  it("clears the unsaved-settings warning after a later save works", () => {
    const warned = session({ notice: "settings-not-saved" });
    expect(sessionReducer(warned, { type: "saved" }).notice).toBeNull();
  });

  it("keeps other notices when settings save", () => {
    const caveat = session({ notice: "import-caveat" });
    expect(sessionReducer(caveat, { type: "saved" }).notice).toBe(
      "import-caveat",
    );
  });

  it("keeps the chosen gameweek inside a shorter refreshed horizon", () => {
    const lastWeek = session({
      lineupIndex: 3,
      result: analysis([35, 36, 37, 38]),
    });
    const shorter = analysis([37, 38]);
    const results = [
      { type: "restore-compared", result: shorter },
      { type: "price-confirmed", settings, id: 1, result: shorter },
      { type: "lock-toggled", settings, result: shorter },
    ] as const;
    for (const action of results)
      expect(sessionReducer(lastWeek, action).lineupIndex).toBe(1);
  });

  it("clears an earlier refresh error once a refresh succeeds", () => {
    const failed = session({ error: "Refresh unavailable", customError: "x" });
    const next = sessionReducer(failed, {
      type: "refreshed",
      settings,
      confirmedPrices: [],
      result: analysis([9, 10, 11, 12]),
      selection: null,
    });
    expect(next.error).toBe("");
    expect(next.customError).toBe("");
  });

  it("keeps the same gameweek when the horizon moves on", () => {
    const onGw10 = session({ lineupIndex: 1 });
    const next = sessionReducer(onGw10, {
      type: "refreshed",
      settings,
      confirmedPrices: [],
      result: analysis([10, 11, 12, 13]),
      selection: null,
    });
    expect(next.lineupIndex).toBe(0);
  });

  it("shows the first gameweek when the chosen one has passed", () => {
    const onGw9 = session({ lineupIndex: 0 });
    const next = sessionReducer(onGw9, {
      type: "refreshed",
      settings,
      confirmedPrices: [],
      result: analysis([10, 11, 12, 13]),
      selection: null,
    });
    expect(next.lineupIndex).toBe(0);
  });

  it("drops the price confirmation when a custom comparison replaces the preview", () => {
    const confirmed = session({ priceConfirmed: true });
    const custom = transferSelection(
      [],
      9,
      {
        outId: 8,
        inId: 16,
        cost: 0,
        remainingBank: 0,
        hit: 0,
        gain: 1,
        immediateGain: 1,
        grossGain: 1,
        reasons: [],
        risks: [],
        fixtures: [],
      },
      true,
    );
    const next = sessionReducer(confirmed, {
      type: "custom-compared",
      settings,
      result: analysis([9, 10]),
      selection: custom,
    });
    expect(next.priceConfirmed).toBe(false);
  });
});
