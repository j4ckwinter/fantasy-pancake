import { describe, expect, it } from "vitest";
import type { Analysis } from "@/lib/model";
import type { Settings } from "@/lib/schemas";
import { initialSession, sessionReducer, type Session } from "./session";

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
    moves: [],
    plans: [],
    threshold: 2,
    rollReason: "",
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
});
