import { describe, expect, it } from "vitest";
import {
  analyze,
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

function strongClubSix(data: Data) {
  for (const [id, position] of [
    [261, 2],
    [262, 3],
    [263, 4],
  ])
    data.bootstrap.elements.push(
      player(id, position, 6, { expected_goals: 9, expected_assists: 6 }),
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
  it("values Triple Captain as one more helping of the top scorer, doubled by a double gameweek", () => {
    const { data, settings } = withChips();
    setPlayer(data, 13, { expected_goals: 12, expected_assists: 6 });
    data.fixtures.push(
      ...data.fixtures
        .filter((fixture) => fixture.event === 12 && fixture.team_h === 5)
        .map((fixture) => ({ ...fixture, id: 999, event: 13 })),
    );
    const valuation = valued(rowsFor(analyze(data, settings).chips, "3xc")[0]);
    const gain = (week: number) =>
      valuation.options.find((option) => option.week === week)!.gain;
    const star = data.bootstrap.elements.find((member) => member.id === 13)!;
    const topScore = Math.max(
      ...data.bootstrap.elements.map((member) => scorePlayer(data, member, 12)),
    );
    expect(gain(12)).toBeCloseTo(scorePlayer(data, star, 12), 2);
    expect(gain(12)).toBeCloseTo(topScore, 2);
    expect(gain(13)).toBeCloseTo(2 * gain(12), 1);
    expect(valuation.best.week).toBe(13);
    expect(valuation.best.lineup.captain).toBe(13);
    expect(valuation.recommendation).toEqual({
      kind: "play",
      week: 13,
      reason: "clears-bar",
    });
  });

  it("values Bench Boost at nothing when the bench cannot play, and at the bench's points when it can", () => {
    const reserves = [2, 12, 14, 15];
    const injured = withChips();
    for (const id of reserves)
      setPlayer(injured.data, id, {
        status: "i",
        chance_of_playing_next_round: 0,
      });
    const idle = valued(
      rowsFor(analyze(injured.data, injured.settings).chips, "bboost")[0],
    );
    for (const option of idle.options) {
      expect(option.gain).toBe(0);
      expect([...option.bench].sort((a, b) => a - b)).toEqual(reserves);
    }
    const fit = withChips();
    const boost = valued(
      rowsFor(analyze(fit.data, fit.settings).chips, "bboost")[0],
    );
    const points = (id: number) =>
      scorePlayer(
        fit.data,
        fit.data.bootstrap.elements.find((member) => member.id === id)!,
        11,
      );
    expect([...boost.options[0].bench].sort((a, b) => a - b)).toEqual(reserves);
    expect(boost.options[0].gain).toBeCloseTo(
      points(1) + points(8) + 2 * points(13),
      2,
    );
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
    const plan = result.plans.find(
      (candidate) =>
        candidate.kind === "plan-ahead" && candidate.variant === "best",
    );
    const planned = plan
      ? plan.weeks[0].score - plan.weeks[0].hit
      : result.baseline[0].score;
    expect(option.gain).toBeCloseTo(option.lineup.score - planned, 1);
  });

  it("reports that no legal Free Hit squad was found instead of a zero gain", () => {
    const { data, settings } = withChips();
    setPlayer(data, 4, { team: 1 });
    const freeHit = available(
      rowsFor(analyze(data, settings).chips, "freehit")[0],
    );
    expect(freeHit.valuation).toEqual({ kind: "no-squad" });
  });

  it("gives a shared best week to the chip that beats its bar by most, and holds the other", () => {
    const { data, settings } = withChips();
    setPlayer(data, 13, { expected_goals: 12, expected_assists: 6 });
    for (const team of [1, 4, 5]) addDouble(data, team, 13);
    const chips = analyze(data, settings).chips;
    const captain = valued(rowsFor(chips, "3xc")[0]);
    const boost = valued(rowsFor(chips, "bboost")[0]);
    expect(captain.best.week).toBe(13);
    expect(boost.best.week).toBe(13);
    expect(boost.best.gain).toBeGreaterThan(captain.best.gain);
    expect(captain.best.gain - captain.threshold).toBeGreaterThan(
      boost.best.gain - boost.threshold,
    );
    expect(captain.recommendation).toEqual({
      kind: "play",
      week: 13,
      reason: "clears-bar",
    });
    expect(boost.recommendation).toEqual({
      kind: "hold",
      reason: "week-taken",
      takenBy: "3xc",
    });
  });

  it("chooses chip weeks for the largest total gain, not the largest single gain", () => {
    const { data, settings } = withChips();
    setPlayer(data, 13, { expected_goals: 12, expected_assists: 6 });
    for (const team of [1, 4, 5]) addDouble(data, team, 13);
    for (const team of [1, 4]) addDouble(data, team, 14);
    const chips = analyze(data, settings).chips;
    const boost = valued(rowsFor(chips, "bboost")[0]);
    const captain = valued(rowsFor(chips, "3xc")[0]);
    const gain = (options: typeof boost.options, week: number) =>
      options.find((option) => option.week === week)!.gain;
    expect(boost.best.week).toBe(13);
    expect(gain(boost.options, 13)).toBeGreaterThan(gain(captain.options, 13));
    expect(gain(boost.options, 14) + gain(captain.options, 13)).toBeGreaterThan(
      gain(boost.options, 13) + gain(captain.options, 14),
    );
    expect(boost.recommendation).toEqual({
      kind: "play",
      week: 14,
      reason: "clears-bar",
    });
    expect(captain.recommendation).toEqual({
      kind: "play",
      week: 13,
      reason: "clears-bar",
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

  it("values a Wildcard at nothing when no better squad exists", () => {
    const { data, settings } = withChips();
    const wildcard = valued(
      rowsFor(analyze(data, settings).chips, "wildcard")[0],
    );
    expect(wildcard.options.map((option) => option.gain)).toEqual([0, 0, 0, 0]);
    expect(wildcard.recommendation).toEqual({
      kind: "hold",
      reason: "below-threshold",
    });
  });

  it("values a Wildcard as the rebuilt squad kept to the end of the horizon", () => {
    const { data, settings } = withChips();
    strongClubSix(data);
    const locked = {
      ...settings,
      lockedPlayerIds: settings.squad.map((pick) => pick.id),
    };
    const result = analyze(data, locked);
    expect(result.plans).toEqual([]);
    const freeHit = valued(rowsFor(result.chips, "freehit")[0]);
    const wildcard = valued(rowsFor(result.chips, "wildcard")[0]);
    const gain = (options: typeof wildcard.options, week: number) =>
      options.find((option) => option.week === week)!.gain;
    expect(gain(freeHit.options, 11)).toBeGreaterThan(0);
    for (const [week, weeksKept] of [
      [11, 4],
      [12, 3],
      [14, 1],
    ])
      expect(gain(wildcard.options, week)).toBeCloseTo(
        weeksKept * gain(freeHit.options, 11),
        1,
      );
    expect(wildcard.options[0].coveredWeeks).toEqual([11, 12, 13, 14]);
    expect(wildcard.best.week).toBe(11);
  });

  it("values chips after a Wildcard against the Wildcard squad", () => {
    const { data, settings } = withChips();
    strongClubSix(data);
    const result = analyze(data, {
      ...settings,
      lockedPlayerIds: settings.squad.map((pick) => pick.id),
    });
    const wildcard = valued(rowsFor(result.chips, "wildcard")[0]);
    expect(wildcard.recommendation).toMatchObject({ kind: "play", week: 11 });
    const freeHit = valued(rowsFor(result.chips, "freehit")[0]);
    expect(
      freeHit.options.filter((option) => option.week > 11).map((o) => o.gain),
    ).toEqual([0, 0, 0]);
    const boost = valued(rowsFor(result.chips, "bboost")[0]);
    const later = boost.options.find((option) => option.week === 12)!;
    const wildcardSquad = [...wildcard.best.lineup.ids, ...wildcard.best.bench];
    expect([...later.lineup.ids, ...later.bench].sort()).toEqual(
      wildcardSquad.sort(),
    );
    expect(later.gain).toBeCloseTo(
      later.bench.reduce(
        (sum, id) =>
          sum +
          scorePlayer(
            data,
            data.bootstrap.elements.find((member) => member.id === id)!,
            12,
          ),
        0,
      ),
      1,
    );
  });

  it("values a later Wildcard against the plan's own weeks from that week on", () => {
    const { data, settings } = withChips();
    strongClubSix(data);
    for (const [id, position] of [
      [271, 3],
      [272, 4],
    ])
      data.bootstrap.elements.push(
        player(id, position, 1, { expected_goals: 7, expected_assists: 6 }),
      );
    const result = analyze(data, settings);
    const plan = result.plans.find(
      (candidate) =>
        candidate.kind === "plan-ahead" && candidate.variant === "best",
    )!;
    const movesIn = (week: number) =>
      plan.weeks.find((planned) => planned.week === week)!.actions.length;
    expect(movesIn(11)).toBeGreaterThan(0);
    expect(movesIn(13)).toBeGreaterThan(0);
    const option = valued(rowsFor(result.chips, "wildcard")[0]).options.find(
      (candidate) => candidate.week === 12,
    )!;
    const planned = plan.weeks
      .filter((planned) => planned.week >= 12)
      .reduce((sum, planned) => sum + planned.score - planned.hit, 0);
    expect(option.gain).toBeCloseTo(3 * option.lineup.score - planned, 1);
  });

  it("values a Wildcard against the recommended plan, not against holding", () => {
    const { data, settings } = withChips();
    strongClubSix(data);
    const lockedResult = analyze(data, {
      ...settings,
      lockedPlayerIds: settings.squad.map((pick) => pick.id),
    });
    const result = analyze(data, settings);
    const plan = result.plans.find(
      (candidate) =>
        candidate.kind === "plan-ahead" && candidate.variant === "best",
    )!;
    expect(plan.gain).toBeGreaterThan(0);
    const holdingGain = valued(rowsFor(lockedResult.chips, "wildcard")[0])
      .options[0].gain;
    const planGain = valued(rowsFor(result.chips, "wildcard")[0]).options[0]
      .gain;
    expect(planGain).toBeCloseTo(holdingGain - plan.gain, 1);
  });
});
