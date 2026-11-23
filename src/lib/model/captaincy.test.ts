import { describe, expect, it } from "vitest";
import {
  analyze,
  previewCaptaincy,
  previewTransfers,
  type Captaincy,
} from "../model";
import type { Data, Player } from "../schemas";
import { addPlayer, seasonContext, STAR_ID } from "./test-fixtures";

function setPlayer(data: Data, id: number, overrides: Partial<Player>) {
  const player = data.bootstrap.elements.find((element) => element.id === id)!;
  Object.assign(player, overrides);
}

const rankedIds = (captaincy: Captaincy) => [
  captaincy.captain.playerId,
  captaincy.viceCaptain.playerId,
  ...captaincy.otherOptions.map((option) => option.playerId),
];

function fiveFourOneWithDoubtfulStriker(data: Data) {
  for (const id of [3, 4, 5, 6, 7])
    setPlayer(data, id, { expected_goals: 8, expected_assists: 4 });
  for (const id of [8, 9, 10, 11])
    setPlayer(data, id, { expected_goals: 6, expected_assists: 4 });
  setPlayer(data, 12, { expected_goals: 3, expected_assists: 2 });
  setPlayer(data, 13, {
    expected_goals: 12,
    status: "d",
    chance_of_playing_next_round: 50,
  });
  for (const id of [14, 15])
    setPlayer(data, id, { expected_goals: 0, expected_assists: 0 });
}

describe("captaincy", () => {
  it("ranks the starting XI by expected points with the gap to the next option", () => {
    const { data, settings } = seasonContext();
    setPlayer(data, 13, { expected_goals: 12, expected_assists: 6 });
    setPlayer(data, 9, { expected_goals: 6, expected_assists: 4 });
    const [week] = analyze(data, settings).captaincy;
    expect(week.week).toBe(11);
    expect(week.captain.playerId).toBe(13);
    expect(week.viceCaptain.playerId).toBe(9);
    const options = [week.captain, week.viceCaptain, ...week.otherOptions];
    expect(options).toHaveLength(11);
    for (const [index, option] of options.entries()) {
      const next = options[index + 1];
      expect(option.gapToNext).toBe(
        next
          ? Math.round((option.expectedPoints - next.expectedPoints) * 100) /
              100
          : null,
      );
      if (next)
        expect(option.expectedPoints).toBeGreaterThanOrEqual(
          next.expectedPoints,
        );
    }
    expect(week.captain.gapToNext).toBeGreaterThan(0);
  });

  it("breaks ties by player id so the same captain is chosen every time", () => {
    const { data, settings } = seasonContext();
    for (const id of [8, 9, 10])
      setPlayer(data, id, { expected_goals: 9, expected_assists: 6 });
    const [week] = analyze(data, settings).captaincy;
    expect(rankedIds(week).slice(0, 3)).toEqual([8, 9, 10]);
    expect(week.captain.gapToNext).toBe(0);
    expect(week.viceCaptain.gapToNext).toBe(0);
    expect(week.otherOptions[0].gapToNext).toBeGreaterThan(0);
  });

  it("agrees with the lineup's captain in every week", () => {
    const { data, settings } = seasonContext();
    addPlayer(data);
    setPlayer(data, 13, { expected_goals: 12 });
    const result = analyze(data, settings);
    expect(result.captaincy.map((week) => week.captain.playerId)).toEqual(
      result.baseline.map((lineup) => lineup.captain),
    );
    const actions = [{ week: 11, outId: 8, inId: STAR_ID }];
    expect(
      previewCaptaincy(data, settings, actions).map(
        (week) => week.captain.playerId,
      ),
    ).toEqual(
      previewTransfers(data, settings, actions).map((lineup) => lineup.captain),
    );
  });

  it("follows a previewed transfer into the new XI", () => {
    const { data, settings } = seasonContext();
    addPlayer(data, { expected_goals: 20, expected_assists: 10 });
    const before = analyze(data, settings).captaincy;
    expect(before.map((week) => week.captain.playerId)).not.toContain(STAR_ID);
    const after = previewCaptaincy(data, settings, [
      { week: 12, outId: 8, inId: STAR_ID },
    ]);
    expect(after.map((week) => week.captain.playerId)).toEqual([
      before[0].captain.playerId,
      STAR_ID,
      STAR_ID,
      STAR_ID,
    ]);
    expect(after[1].captain.expectedPoints).toBeGreaterThan(
      before[1].captain.expectedPoints,
    );
  });

  it("keeps the backup goalkeeper fixed and orders three outfield substitutes", () => {
    const { data, settings } = seasonContext();
    const [week] = analyze(data, settings).captaincy;
    expect(week.benchGoalkeeper).toBe(2);
    expect(week.bench).toHaveLength(3);
    expect(week.bench.map((slot) => slot.playerId)).not.toContain(2);
  });

  it("orders the bench by cover for starters a substitute can legally replace", () => {
    const { data, settings } = seasonContext();
    fiveFourOneWithDoubtfulStriker(data);
    const result = analyze(data, settings);
    const [lineup] = result.baseline;
    expect([...lineup.ids].sort((a, b) => a - b)).toEqual([
      1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13,
    ]);
    const [week] = result.captaincy;
    expect(week.bench.map((slot) => slot.playerId)).toEqual([14, 15, 12]);
    const [first, second, third] = week.bench;
    expect(first.coverChance).toBe(0.5);
    expect(second.coverChance).toBe(0.5);
    expect(third.coverChance).toBe(0);
    expect(third.expectedPoints).toBeGreaterThan(first.expectedPoints);
    expect(first.expectedContribution).toBeCloseTo(
      first.coverChance * first.expectedPoints,
      1,
    );
  });

  it("puts blank-gameweek players last on the bench and never captains them", () => {
    const { data, settings } = seasonContext();
    data.fixtures = data.fixtures.filter(
      (fixture) => !(fixture.event === 11 && fixture.team_h === 4),
    );
    const [blank, normal] = analyze(data, settings).captaincy;
    const blankIds = [10, 11, 12];
    expect(blankIds).not.toContain(blank.captain.playerId);
    expect(blankIds).not.toContain(blank.viceCaptain.playerId);
    const benchBlanks = blank.bench.filter((slot) =>
      blankIds.includes(slot.playerId),
    );
    expect(benchBlanks.length).toBeGreaterThan(0);
    for (const slot of benchBlanks) expect(slot.expectedPoints).toBe(0);
    expect(blank.bench.slice(-benchBlanks.length)).toEqual(benchBlanks);
    expect(normal.bench.every((slot) => slot.expectedPoints > 0)).toBe(true);
  });

  it("captains a double-gameweek player and treats either match as playing", () => {
    const { data, settings } = seasonContext();
    data.fixtures.push({
      id: 999,
      event: 12,
      team_h: 20,
      team_a: 5,
      team_h_difficulty: 3,
      team_a_difficulty: 3,
      finished: false,
      kickoff_time: "2026-10-20T12:00:00Z",
    });
    setPlayer(data, 13, { status: "d", chance_of_playing_next_round: 75 });
    const [single, double] = analyze(data, settings).captaincy;
    expect(single.captain.playerId).not.toBe(14);
    expect(double.captain.playerId).toBe(14);
    expect(double.captain.expectedPoints).toBeGreaterThan(
      1.5 * single.captain.expectedPoints,
    );
  });

  it("counts a starter with two fixtures as missing only if he misses both", () => {
    const { data, settings } = seasonContext();
    fiveFourOneWithDoubtfulStriker(data);
    setPlayer(data, 13, {
      status: "a",
      chance_of_playing_next_round: 100,
      minutes: 300,
      starts: 2,
    });
    for (const id of [14, 15]) setPlayer(data, id, { minutes: 0, starts: 0 });
    data.fixtures.push({
      id: 999,
      event: 12,
      team_h: 20,
      team_a: 5,
      team_h_difficulty: 3,
      team_a_difficulty: 3,
      finished: false,
      kickoff_time: "2026-10-20T12:00:00Z",
    });
    const [single, double] = analyze(data, settings).captaincy;
    const cover = (week: Captaincy) =>
      week.bench.find((slot) => slot.playerId === 14)!.coverChance;
    expect(cover(single)).toBeGreaterThan(0);
    expect(cover(single)).toBeLessThan(1);
    expect(cover(double)).toBeCloseTo(cover(single) ** 2, 2);
  });
});
