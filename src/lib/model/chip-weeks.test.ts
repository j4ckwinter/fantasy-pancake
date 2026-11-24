import { describe, expect, it } from "vitest";
import type { ChipName } from "../schemas";
import type { ChipPlay } from "./chip-paths";
import { chooseChips } from "./chip-weeks";

const BARS: Record<ChipName, number> = {
  wildcard: 20,
  freehit: 20,
  bboost: 15,
  "3xc": 8,
};

type Row = { chip: ChipName; gains: Record<number, number>; expires: boolean };

function row(
  chip: ChipName,
  gains: Record<number, number>,
  expires = false,
): Row {
  return { chip, gains, expires };
}

function recommendWeeks(rows: Row[]) {
  const evaluate = (plays: readonly ChipPlay[]) => ({
    gain: plays.reduce(
      (sum, play) =>
        sum +
        (rows.find(
          (candidate) =>
            candidate.chip === play.chip && play.week in candidate.gains,
        )?.gains[play.week] ?? 0),
      0,
    ),
    weeks: [],
  });
  return chooseChips(
    evaluate,
    rows.map(({ chip, gains, expires }) => ({
      chip,
      weeks: Object.keys(gains).map(Number),
      threshold: BARS[chip],
      expires,
    })),
  ).map((choice) => choice?.recommendation);
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

  it("does not play an expiring chip for a gain too small to show", () => {
    expect(
      recommendWeeks([row("bboost", { 11: 0.04, 12: 0.3 }, true)]),
    ).toEqual([{ kind: "play", week: 12, reason: "expires" }]);
    expect(recommendWeeks([row("bboost", { 11: 0.04 }, true)])).toEqual([
      { kind: "hold", reason: "below-threshold" },
    ]);
  });
});
