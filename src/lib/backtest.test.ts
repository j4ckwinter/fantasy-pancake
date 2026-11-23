import { describe, expect, it } from "vitest";
import {
  accuracyReport,
  bestSingleTransfer,
  bias,
  calibrationValidates,
  fitParameters,
  forecastRows,
  inputsAtDeadline,
  meanAbsoluteError,
  realisedPoints,
  sampleSettings,
  seasonArchiveSchema,
  seededRandom,
  spearman,
  topHitRate,
  trainingRows,
  validationRows,
  type ArchiveRow,
  type ForecastRow,
  type SeasonArchive,
} from "./evaluation";
import { UNCALIBRATED_PARAMETERS } from "./model/calibrated-parameters";
import { gameSettings, positionRules, player } from "./model/test-fixtures";

const EVENTS = [1, 2, 3, 4, 5];
const deadline = (event: number) =>
  `2026-08-${String(event * 7).padStart(2, "0")}T10:00:00Z`;
const kickoff = (event: number) =>
  `2026-08-${String(event * 7).padStart(2, "0")}T15:00:00Z`;

function row(
  fixture: number,
  event: number,
  wasHome: boolean,
  overrides: Partial<ArchiveRow> = {},
): ArchiveRow {
  return {
    fixture,
    round: event,
    minutes: 90,
    starts: 1,
    expected_goals: 0.5,
    expected_assists: 0.2,
    expected_goals_conceded: 1,
    defensive_contribution: 8,
    total_points: 6,
    was_home: wasHome,
    saves: 0,
    bonus: 1,
    yellow_cards: 0,
    red_cards: 0,
    own_goals: 0,
    penalties_missed: 0,
    penalties_saved: 0,
    kickoff_time: kickoff(event),
    value: 60 + event,
    selected: 1000 * event,
    creativity: 10,
    ...overrides,
  };
}

function archive(): SeasonArchive {
  const fixtures = EVENTS.flatMap((event) => [
    {
      id: event * 10 + 1,
      event,
      team_h: 1,
      team_a: 2,
      team_h_difficulty: 3,
      team_a_difficulty: 3,
      finished: event <= 4,
      kickoff_time: kickoff(event),
    },
    {
      id: event * 10 + 2,
      event,
      team_h: 3,
      team_a: 4,
      team_h_difficulty: 2,
      team_a_difficulty: 4,
      finished: event <= 4,
      kickoff_time: kickoff(event),
    },
  ]);
  const striker = player(1, 4, 3, { now_cost: 999, minutes: 9999 });
  const keeper = player(2, 1, 1);
  const lateSigning = player(3, 3, 4);
  return seasonArchiveSchema.parse({
    bootstrap: {
      elements: [striker, keeper, lateSigning],
      teams: [1, 2, 3, 4].map((id) => ({
        id,
        name: `Club ${id}`,
        short_name: `C${id}`,
      })),
      events: EVENTS.map((id) => ({
        id,
        name: `Gameweek ${id}`,
        deadline_time: deadline(id),
        is_current: id === 5,
        is_next: false,
        finished: id <= 4,
      })),
      element_types: positionRules(),
      game_settings: gameSettings(),
    },
    fixtures,
    histories: {
      "1": [
        row(12, 1, true),
        row(21, 2, false, { minutes: 30, starts: 0, total_points: 2 }),
        row(31, 3, false, { expected_goals: 3, total_points: 15 }),
        row(41, 4, false, { total_points: 9 }),
        row(51, 4, false, {
          total_points: 2,
          kickoff_time: kickoff(4).replace("15:00", "19:00"),
        }),
      ],
      "2": EVENTS.slice(0, 4).map((event) => row(event * 10 + 1, event, true)),
      "3": [row(42, 4, false, { minutes: 0, starts: 0, total_points: 0 })],
    },
  });
}

describe("leak-free deadline inputs", () => {
  it("rebuilds season aggregates, price and club from rows before the deadline only", () => {
    const { data, ownership } = inputsAtDeadline(archive(), 3);
    const striker = data.bootstrap.elements.find((p) => p.id === 1)!;
    expect(striker).toMatchObject({
      team: 2,
      now_cost: 62,
      minutes: 120,
      starts: 1,
      expected_goals: 1,
      bonus: 2,
      status: "a",
      chance_of_playing_next_round: null,
      penalties_order: null,
    });
    expect(ownership.get(1)).toBe(2000);
    expect(data.histories?.["1"].map((r) => r.round)).toEqual([1, 2]);
    expect(data.fetchedAt).toBe(deadline(3));
  });

  it("leaves players who were not yet in the game out, and later fixtures unplayed", () => {
    const { data } = inputsAtDeadline(archive(), 3);
    expect(data.bootstrap.elements.map((p) => p.id)).toEqual([1, 2]);
    expect(data.fixtures.filter((f) => f.finished).map((f) => f.event)).toEqual(
      [1, 1, 2, 2],
    );
    expect(data.bootstrap.events.find((e) => e.is_next)?.id).toBe(3);
  });

  it("drops a row from the deadline's own round even when it kicked off earlier", () => {
    const season = archive();
    season.histories["1"][2].kickoff_time = deadline(3).replace(
      "10:00",
      "09:00",
    );
    const { data } = inputsAtDeadline(season, 3);
    expect(data.bootstrap.elements.find((p) => p.id === 1)?.minutes).toBe(120);
  });

  it("drops a row whose kickoff is after the deadline even when its round is earlier", () => {
    const season = archive();
    season.histories["1"][1].kickoff_time = deadline(3).replace(
      "10:00",
      "11:00",
    );
    const { data } = inputsAtDeadline(season, 3);
    expect(data.bootstrap.elements.find((p) => p.id === 1)?.minutes).toBe(90);
  });
});

describe("forecast rows", () => {
  it("compares each forecast with realised points, summing a double gameweek", () => {
    const rows = forecastRows(
      archive(),
      [3],
      (_data, player, week) => player.id * 10 + week,
    );
    expect(
      rows.map(({ playerId, target, predicted, actual, appeared }) => [
        playerId,
        target,
        predicted,
        actual,
        appeared,
      ]),
    ).toEqual([
      [1, 3, 13, 15, true],
      [1, 4, 14, 11, true],
      [2, 3, 23, 6, true],
      [2, 4, 24, 6, true],
    ]);
  });

  it("splits training and validation by time without overlap", () => {
    const rows = [3, 4, 6, 7].flatMap((deadline) =>
      [deadline, deadline + 1].map(
        (target) => ({ deadline, target }) as ForecastRow,
      ),
    );
    expect(trainingRows(rows).map((r) => [r.deadline, r.target])).toEqual([
      [3, 3],
      [3, 4],
      [4, 4],
      [4, 5],
      [6, 6],
    ]);
    expect(validationRows(rows).map((r) => [r.deadline, r.target])).toEqual([
      [7, 7],
      [7, 8],
    ]);
  });
});

describe("accuracy metrics", () => {
  const pairs = [
    { predicted: 1, actual: 0 },
    { predicted: 2, actual: 4 },
    { predicted: 3, actual: 3 },
  ];
  it("measures mean absolute error and signed bias", () => {
    expect(meanAbsoluteError(pairs)).toBe(1);
    expect(bias(pairs)).toBeCloseTo(-1 / 3);
  });
  it("ranks with averaged ties for Spearman correlation", () => {
    expect(spearman(pairs)).toBeCloseTo(0.5);
    expect(
      spearman([
        { predicted: 1, actual: 1 },
        { predicted: 2, actual: 2 },
        { predicted: 2, actual: 3 },
        { predicted: 3, actual: 4 },
      ]),
    ).toBeCloseTo(3 / Math.sqrt(10));
  });
  it("counts a top-N pick as a hit when it ties the N-th actual score", () => {
    const items = [
      { id: 1, predicted: 9, actual: 5 },
      { id: 2, predicted: 8, actual: 1 },
      { id: 3, predicted: 1, actual: 5 },
      { id: 4, predicted: 0, actual: 0 },
    ];
    expect(topHitRate(items, 2)).toBe(0.5);
    expect(topHitRate(items, 1)).toBe(1);
  });
  it("reports overall and per-position accuracy", () => {
    const rows: ForecastRow[] = [
      {
        deadline: 3,
        target: 3,
        playerId: 1,
        position: 4,
        predicted: 4,
        actual: 2,
        appeared: true,
      },
      {
        deadline: 3,
        target: 3,
        playerId: 2,
        position: 1,
        predicted: 1,
        actual: 0,
        appeared: false,
      },
    ];
    const report = accuracyReport(rows);
    expect(report.all).toMatchObject({
      playerWeeks: 2,
      maeAll: 1.5,
      biasAll: 1.5,
      maeAppeared: 2,
    });
    expect(report[4]).toMatchObject({ playerWeeks: 1, maeAll: 2 });
    expect(report[2].playerWeeks).toBe(0);
  });
});

describe("calibration", () => {
  it("adopts calibrated values only when validation error and ranking both improve", () => {
    const report = (maeAll: number, horizonSpearman: number) =>
      ({ all: { maeAll, horizonSpearman } }) as Parameters<
        typeof calibrationValidates
      >[0];
    expect(calibrationValidates(report(1.2, 0.7), report(1.1, 0.71))).toBe(
      true,
    );
    expect(calibrationValidates(report(1.2, 0.7), report(1.1, 0.7))).toBe(
      false,
    );
    expect(calibrationValidates(report(1.2, 0.7), report(1.2, 0.8))).toBe(
      false,
    );
  });

  it("fits position scales by least squares and grid values by training error", () => {
    const rowsFor = (parameters: typeof UNCALIBRATED_PARAMETERS) =>
      [1, 2, 3, 4].map((actual): ForecastRow => ({
        deadline: 3,
        target: 3,
        playerId: actual,
        position: 3,
        predicted:
          (actual / 2) * parameters.positionScale[3] +
          Math.abs(parameters.bonusPrior90 - 0.2),
        actual,
        appeared: true,
      }));
    const fitted = fitParameters(
      UNCALIBRATED_PARAMETERS,
      {
        seasonMinutesPriorMatches: [2],
        recentRateSeasonWeight: [2],
        bonusPrior90: [0, 0.2, 0.4],
        attackChangePerDifficulty: [0.12],
        concededChangePerDifficulty: [0.15],
      },
      rowsFor,
    );
    expect(fitted.bonusPrior90).toBe(0.2);
    expect(fitted.positionScale[3]).toBe(2);
  });
});

describe("decision replay", () => {
  it("samples the same legal, affordable squads from the same seed", () => {
    const { data } = inputsAtDeadline(archive(), 3);
    const elements = Array.from({ length: 40 }, (_, index) =>
      player(index + 10, (index % 4) + 1, (index % 8) + 1, {
        now_cost: 45 + index,
      }),
    );
    data.bootstrap.elements = elements;
    const ownership = new Map(elements.map((p) => [p.id, p.id]));
    const first = sampleSettings(data, ownership, 3, seededRandom(7));
    expect(sampleSettings(data, ownership, 3, seededRandom(7))).toEqual(first);
    for (const settings of first) {
      const picks = settings.squad.map((pick) =>
        elements.find((p) => p.id === pick.id)!,
      );
      expect(new Set(picks.map((p) => p.id)).size).toBe(15);
      expect(picks.map((p) => p.element_type).sort()).toEqual([
        1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4,
      ]);
      const clubs = new Map<number, number>();
      for (const p of picks) clubs.set(p.team, (clubs.get(p.team) ?? 0) + 1);
      expect(Math.max(...clubs.values())).toBeLessThanOrEqual(3);
      expect(settings.bank).toBeGreaterThanOrEqual(0);
      expect(
        picks.reduce((sum, p) => sum + p.now_cost, 0) + settings.bank,
      ).toBe(1000);
    }
  });

  it("realises the frozen XI's points with the captain counted twice", () => {
    const { data } = inputsAtDeadline(archive(), 3);
    const elements = Array.from({ length: 15 }, (_, index) =>
      player(
        index + 1,
        [1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4][index],
        index + 1,
      ),
    );
    data.bootstrap.elements = elements;
    const selector = [new Map(elements.map((p) => [p.id, p.id]))];
    const points = realisedPoints(data, elements, [3], selector, (id) =>
      id === 15 ? 10 : 1,
    );
    expect(points).toBe(10 * 2 + 10);
  });

  it("picks the single legal transfer with the largest forecast gain", () => {
    const { data } = inputsAtDeadline(archive(), 3);
    const shape = [1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4];
    const squad = shape.map((position, index) =>
      player(index + 1, position, index + 1, { now_cost: 50 }),
    );
    const cheapStar = player(20, 4, 16, { now_cost: 55 });
    const dearStar = player(21, 4, 17, { now_cost: 80 });
    const fringe = player(22, 4, 18, { now_cost: 50 });
    data.bootstrap.elements = [...squad, cheapStar, dearStar, fringe];
    const scores = [
      new Map([...squad.map((p) => [p.id, 1] as const), [20, 5], [21, 9]]),
    ];
    const settings = {
      version: 1 as const,
      entryId: 1,
      sourceGameweek: 2,
      season: "test",
      bank: 10,
      freeTransfers: 1,
      squad: squad.map((p) => ({ id: p.id, sellingPrice: 50 })),
    };
    expect(bestSingleTransfer(data, settings, scores)).toEqual({
      swap: { outId: 13, inId: 20 },
      gain: 8,
    });
  });
});
