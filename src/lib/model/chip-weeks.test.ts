import { describe, expect, it } from "vitest";
import type { ChipName } from "../schemas";
import { recommendWeeks, type ValuedRow } from "./chip-weeks";

const BARS: Record<Exclude<ChipName, "wildcard">, number> = {
  freehit: 20,
  bboost: 15,
  "3xc": 8,
};

function row(
  chip: Exclude<ChipName, "wildcard">,
  gains: Record<number, number>,
  expires = false,
): ValuedRow {
  return {
    chip,
    threshold: BARS[chip],
    expires,
    options: Object.entries(gains).map(([week, gain]) => ({
      week: Number(week),
      gain,
      lineup: { score: 0, ids: [], captain: 0 },
      bench: [],
    })),
  };
}

describe("one chip per gameweek", () => {
  it("moves a chip off its best week when that lets another chip play", () => {
    expect(
      recommendWeeks([
        row("bboost", { 13: 30, 14: 16 }),
        row("freehit", { 13: 25, 14: 5 }),
      ]),
    ).toEqual([
      { kind: "play", week: 14, reason: "clears-bar" },
      { kind: "play", week: 13, reason: "clears-bar" },
    ]);
  });

  it("names the chip that took the held chip's best week", () => {
    const [, , captain] = recommendWeeks([
      row("bboost", { 12: 20 }),
      row("freehit", { 13: 30 }),
      row("3xc", { 12: 9, 13: 12 }),
    ]);
    expect(captain).toEqual({
      kind: "hold",
      reason: "week-taken",
      takenBy: "freehit",
    });
  });

  it("does not advise Free Hits in consecutive gameweeks", () => {
    expect(
      recommendWeeks([
        row("freehit", { 19: 25 }, true),
        row("freehit", { 20: 30, 21: 22 }),
      ]),
    ).toEqual([
      { kind: "play", week: 19, reason: "clears-bar" },
      { kind: "play", week: 21, reason: "clears-bar" },
    ]);
    expect(
      recommendWeeks([
        row("freehit", { 19: 25 }, true),
        row("freehit", { 20: 30 }),
      ]),
    ).toEqual([
      { kind: "hold", reason: "next-to-free-hit", freeHitWeek: 20 },
      { kind: "play", week: 20, reason: "clears-bar" },
    ]);
  });
});
