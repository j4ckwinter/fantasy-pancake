import { describe, expect, it } from "vitest";
import {
  analyze,
  bestLineup,
  CHIP_PLAY_THRESHOLD_POINTS,
  scorePlayer,
  type ChipAdvice,
  type ChipStatus,
} from "../model";
import type { ChipDefinition, ChipName, Data, Player } from "../schemas";
import { addPlayer, player, seasonContext, STAR_ID } from "./test-fixtures";

const SEASON_HALVES = [
  { name: "wildcard", start_event: 2, stop_event: 19 },
  { name: "wildcard", start_event: 20, stop_event: 38 },
  { name: "freehit", start_event: 2, stop_event: 19 },
  { name: "bboost", start_event: 1, stop_event: 19 },
  { name: "3xc", start_event: 1, stop_event: 19 },
  { name: "freehit", start_event: 20, stop_event: 38 },
  { name: "bboost", start_event: 20, stop_event: 38 },
  { name: "3xc", start_event: 20, stop_event: 38 },
];

function chipRules(
  windows: Pick<ChipDefinition, "name" | "start_event" | "stop_event">[],
): ChipDefinition[] {
  return windows.map((window, index) => ({
    id: index + 1,
    number: 1,
    chip_type: "team",
    ...window,
  }));
}

function withChips(
  windows = SEASON_HALVES,
  chipsPlayed: { name: ChipName; event: number }[] = [],
) {
  const { data, settings } = seasonContext();
  data.bootstrap.chips = chipRules(windows);
  return { data, settings: { ...settings, chipsPlayed } };
}

function known(advice: ChipAdvice) {
  if (advice.status !== "known") throw new Error("Chips should be known.");
  return advice.chips;
}

function rowsFor(advice: ChipAdvice, chip: ChipName) {
  return known(advice).filter((row) => row.chip === chip);
}

function available(row: ChipStatus | undefined) {
  if (row?.status !== "available") throw new Error("Chip should be open.");
  return row;
}

function valued(row: ChipStatus | undefined) {
  const { valuation } = available(row);
  if (valuation.kind !== "valued") throw new Error("Chip should be valued.");
  return valuation;
}

function setPlayer(data: Data, id: number, overrides: Partial<Player>) {
  Object.assign(
    data.bootstrap.elements.find((element) => element.id === id)!,
    overrides,
  );
}

function addDouble(data: Data, team: number, week: number) {
  data.fixtures.push({
    id: 1000 + team * 50 + week,
    event: week,
    team_h: team,
    team_a: 19,
    team_h_difficulty: 3,
    team_a_difficulty: 3,
    finished: false,
    kickoff_time: null,
  });
}

describe("chip availability", () => {
  it("opens every unplayed chip for the horizon weeks inside its window", () => {
    const { data, settings } = withChips();
    const chips = known(analyze(data, settings).chips);
    expect(chips.map((row) => [row.chip, row.status])).toEqual([
      ["wildcard", "available"],
      ["freehit", "available"],
      ["bboost", "available"],
      ["3xc", "available"],
    ]);
    expect(available(chips[2]).weeks).toEqual([11, 12, 13, 14]);
    expect(available(chips[2]).window).toEqual({ firstWeek: 1, lastWeek: 19 });
  });

  it("marks a chip used in this half and names the window that opens next", () => {
    const { data, settings } = withChips(SEASON_HALVES, [
      { name: "bboost", event: 2 },
      { name: "wildcard", event: 3 },
    ]);
    const advice = analyze(data, settings).chips;
    expect(rowsFor(advice, "bboost")).toEqual([
      {
        status: "used",
        chip: "bboost",
        week: 2,
        nextWindow: { firstWeek: 20, lastWeek: 38 },
      },
    ]);
    expect(rowsFor(advice, "wildcard")[0].status).toBe("used");
    expect(rowsFor(advice, "3xc")[0].status).toBe("available");
  });

  it("offers each half's chip separately when the horizon spans both halves", () => {
    const halves = [
      { name: "3xc", start_event: 1, stop_event: 12 },
      { name: "3xc", start_event: 13, stop_event: 38 },
    ];
    const unplayed = withChips(halves);
    expect(
      rowsFor(analyze(unplayed.data, unplayed.settings).chips, "3xc").map(
        (row) => available(row).weeks,
      ),
    ).toEqual([
      [11, 12],
      [13, 14],
    ]);
    const played = withChips(halves, [{ name: "3xc", event: 4 }]);
    expect(
      rowsFor(analyze(played.data, played.settings).chips, "3xc").map(
        (row) => available(row).weeks,
      ),
    ).toEqual([[13, 14]]);
  });

  it("reports chips outside their window, with the next window if any", () => {
    const { data, settings } = withChips([
      { name: "freehit", start_event: 20, stop_event: 38 },
      { name: "bboost", start_event: 1, stop_event: 9 },
    ]);
    const advice = analyze(data, settings).chips;
    expect(known(advice)).toEqual([
      {
        status: "outside-window",
        chip: "freehit",
        nextWindow: { firstWeek: 20, lastWeek: 38 },
      },
      { status: "outside-window", chip: "bboost", nextWindow: null },
    ]);
  });

  it("ignores chips FPL adds that the planner does not know", () => {
    const { data, settings } = withChips([
      { name: "manager", start_event: 1, stop_event: 38 },
      { name: "3xc", start_event: 1, stop_event: 38 },
    ]);
    expect(known(analyze(data, settings).chips).map((row) => row.chip)).toEqual(
      ["3xc"],
    );
  });

  it("says which facts are missing instead of guessing chips", () => {
    const { data, settings } = seasonContext();
    expect(analyze(data, { ...settings, chipsPlayed: [] }).chips).toEqual({
      status: "unknown",
      missing: "chip-rules",
    });
    data.bootstrap.chips = chipRules(SEASON_HALVES);
    expect(analyze(data, settings).chips).toEqual({
      status: "unknown",
      missing: "played-chips",
    });
  });
});

describe("chip valuation", () => {
  it("values Triple Captain as the captain's expected points, best in a double week", () => {
    const { data, settings } = withChips();
    setPlayer(data, 13, { expected_goals: 12, expected_assists: 6 });
    addDouble(data, 5, 13);
    const result = analyze(data, settings);
    const valuation = valued(rowsFor(result.chips, "3xc")[0]);
    expect(valuation.options.map((option) => option.gain)).toEqual(
      result.captaincy.map((week) => week.captain.expectedPoints),
    );
    expect(valuation.best.week).toBe(13);
    expect(valuation.best.lineup.captain).toBe(13);
    expect(valuation.threshold).toBe(CHIP_PLAY_THRESHOLD_POINTS["3xc"]);
    expect(valuation.best.gain).toBeGreaterThan(valuation.threshold);
    expect(valuation.recommendation).toEqual({
      kind: "play",
      week: 13,
      reason: "clears-bar",
    });
  });

  it("values Bench Boost as the bench's expected points that week", () => {
    const { data, settings } = withChips();
    const result = analyze(data, settings);
    const valuation = valued(rowsFor(result.chips, "bboost")[0]);
    const squad = data.bootstrap.elements.slice(0, 15);
    result.weeks.forEach((week, index) => {
      const option = valuation.options[index];
      const scores = new Map(
        squad.map((member) => [member.id, scorePlayer(data, member, week)]),
      );
      const lineup = bestLineup(data, squad, scores);
      const bench = squad.filter((member) => !lineup.ids.includes(member.id));
      expect(option.week).toBe(week);
      expect(option.bench).toEqual(bench.map((member) => member.id));
      expect(option.gain).toBeCloseTo(
        bench.reduce((sum, member) => sum + scores.get(member.id)!, 0),
        2,
      );
    });
  });

  it("holds a chip whose best week does not clear its threshold", () => {
    const { data, settings } = withChips();
    const valuation = valued(rowsFor(analyze(data, settings).chips, "3xc")[0]);
    expect(valuation.best.gain).toBeLessThanOrEqual(valuation.threshold);
    expect(valuation.recommendation).toEqual({
      kind: "hold",
      reason: "below-threshold",
    });
  });

  it("builds the best affordable Free Hit squad within the club limit", () => {
    const { data, settings } = withChips();
    for (const [id, position] of [
      [261, 2],
      [262, 3],
      [263, 4],
      [264, 3],
    ])
      data.bootstrap.elements.push(
        player(id, position, 6, { expected_goals: 9, expected_assists: 6 }),
      );
    addPlayer(data, { now_cost: 400 });
    const result = analyze(data, settings);
    const option = valued(rowsFor(result.chips, "freehit")[0]).options[0];
    const squadIds = [...option.lineup.ids, ...option.bench];
    const squad = squadIds.map((id) =>
      data.bootstrap.elements.find((element) => element.id === id)!,
    );
    expect(new Set(squadIds).size).toBe(15);
    expect(
      [1, 2, 3, 4].map(
        (position) =>
          squad.filter((member) => member.element_type === position).length,
      ),
    ).toEqual([2, 5, 5, 3]);
    expect(squad.filter((member) => member.team === 6)).toHaveLength(3);
    expect(squadIds).not.toContain(STAR_ID);
    expect(squad.reduce((sum, member) => sum + member.now_cost, 0)).toBe(750);
    expect(option.lineup.ids).toEqual(expect.arrayContaining([261, 262, 264]));
    expect(option.gain).toBeCloseTo(
      option.lineup.score - result.baseline[0].score,
      1,
    );
    expect(option.gain).toBeGreaterThan(0);
  });

  it("gives a shared best week to the chip that gains most and holds the other", () => {
    const { data, settings } = withChips();
    setPlayer(data, 13, { expected_goals: 12, expected_assists: 6 });
    for (const team of [1, 4, 5]) addDouble(data, team, 13);
    const chips = analyze(data, settings).chips;
    const captain = valued(rowsFor(chips, "3xc")[0]);
    const boost = valued(rowsFor(chips, "bboost")[0]);
    expect(captain.best.week).toBe(13);
    expect(boost.best.week).toBe(13);
    expect(boost.best.gain).toBeGreaterThan(captain.best.gain);
    expect(boost.recommendation).toEqual({
      kind: "play",
      week: 13,
      reason: "clears-bar",
    });
    expect(captain.recommendation).toEqual({
      kind: "hold",
      reason: "week-taken",
      takenBy: "bboost",
    });
  });

  it("plays a chip that expires inside the horizon in its best remaining week, whatever the bar", () => {
    const { data, settings } = withChips([
      { name: "3xc", start_event: 1, stop_event: 12 },
      { name: "3xc", start_event: 13, stop_event: 38 },
      { name: "wildcard", start_event: 2, stop_event: 12 },
    ]);
    setPlayer(data, 13, { status: "d", chance_of_playing_next_round: 50 });
    const chips = analyze(data, settings).chips;
    const [expiring, later] = rowsFor(chips, "3xc");
    expect(available(expiring).expires).toBe(true);
    expect(available(later).expires).toBe(false);
    const valuation = valued(expiring);
    expect(valuation.best.gain).toBeLessThanOrEqual(valuation.threshold);
    expect(valuation.recommendation).toEqual({
      kind: "play",
      week: valuation.best.week,
      reason: "expires",
    });
    expect(valued(later).recommendation).toMatchObject({ kind: "hold" });
    expect(available(rowsFor(chips, "wildcard")[0]).expires).toBe(true);
  });

  it("lists the Wildcard with its window while its valuation is pending", () => {
    const { data, settings } = withChips();
    const wildcard = available(
      rowsFor(analyze(data, settings).chips, "wildcard")[0],
    );
    expect(wildcard.weeks).toEqual([11, 12, 13, 14]);
    expect(wildcard.valuation).toEqual({ kind: "pending" });
  });
});
