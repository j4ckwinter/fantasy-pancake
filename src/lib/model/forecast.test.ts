import { describe, expect, it } from "vitest";
import type { Data, History, Player } from "../schemas";
import { playerForecast, usableHistory } from "./forecast-history";
import { opponentFactors } from "./opponent-strength";
import { scorePlayer, weekAvailability } from "./scoring";

function context() {
  const player: Player = {
    id: 1,
    web_name: "Example",
    team: 1,
    element_type: 3,
    now_cost: 50,
    status: "a",
    news: "",
    can_select: true,
    can_transact: true,
    chance_of_playing_next_round: 100,
    minutes: 360,
    starts: 4,
    expected_goals: 2,
    expected_assists: 1,
    expected_goals_conceded: 5,
    defensive_contribution: 40,
    saves: 0,
    creativity: 0,
    penalties_order: null,
    corners_and_indirect_freekicks_order: null,
    direct_freekicks_order: null,
  };
  const data: Data = {
    fetchedAt: "2026-10-10T12:00:00Z",
    bootstrap: {
      elements: [player],
      teams: [
        { id: 1, name: "Home", short_name: "H" },
        { id: 2, name: "Away", short_name: "A" },
      ],
      events: [9, 10].map((id) => ({
        id,
        name: String(id),
        deadline_time: "2026-10-11T12:00:00Z",
        is_next: id === 9,
        is_current: false,
        finished: false,
      })),
      element_types: [],
      game_settings: {
        squad_squadsize: 15,
        squad_squadplay: 11,
        squad_team_limit: 3,
        max_extra_free_transfers: 4,
      },
    },
    fixtures: Array.from({ length: 10 }, (_, index) => ({
      id: index + 1,
      event: index + 1,
      team_h: 1,
      team_a: 2,
      team_h_difficulty: 3,
      team_a_difficulty: 3,
      finished: index < 8,
      kickoff_time: `2026-10-${String(index + 1).padStart(2, "0")}T12:00:00Z`,
    })),
  };
  return { data, player };
}
function history(minutes: number[]): History {
  return minutes.map((value, index) => ({
    fixture: index + 1,
    round: index + 1,
    minutes: value,
    starts: Number(value >= 60),
    expected_goals: 0.2,
    expected_assists: 0.1,
    expected_goals_conceded: 1,
    defensive_contribution: 10,
    total_points: 2,
    kickoff_time: `2026-10-${String(index + 1).padStart(2, "0")}T12:00:00Z`,
  }));
}

describe("recent-match forecasts", () => {
  it("reacts to recently won and lost starting roles rather than identical season totals", () => {
    const { data, player } = context();
    data.histories = { "1": history([0, 0, 0, 0, 90, 90, 90, 90]) };
    const starter = playerForecast(data, player);
    data.histories["1"] = history([90, 90, 90, 90, 0, 0, 0, 0]);
    const dropped = playerForecast(data, player);
    expect(starter.minutes).toBeGreaterThan(dropped.minutes);
    expect(starter.startProbability).toBeGreaterThan(dropped.startProbability);
    expect(starter.sixtyProbability).toBeGreaterThan(dropped.sixtyProbability);
  });
  it("distinguishes appearance and 60-minute probabilities with equal average minutes", () => {
    const { data, player } = context();
    data.histories = { "1": history([45, 45, 45, 45]) };
    const short = playerForecast(data, player);
    data.histories["1"] = history([0, 90, 0, 90]);
    const mixed = playerForecast(data, player);
    expect(short.appearanceProbability).toBeGreaterThan(
      mixed.appearanceProbability,
    );
    expect(short.sixtyProbability).toBeLessThan(mixed.sixtyProbability);
    expect(
      short.outcomes.reduce((sum, outcome) => sum + outcome.probability, 0),
    ).toBeCloseTo(1);
  });
  it("rejects future, unfinished, unknown, duplicate and target-week history", () => {
    const { data, player } = context();
    const valid = history([90])[0];
    data.histories = {
      "1": [
        valid,
        valid,
        { ...valid, fixture: 2, kickoff_time: data.fetchedAt },
        { ...valid, fixture: 9 },
        { ...valid, fixture: 99 },
        { ...valid, fixture: 3, round: 9 },
      ],
    };
    expect(usableHistory(data, player)).toEqual([valid]);
    const score = scorePlayer(data, player, 9);
    data.histories["1"].push({
      ...valid,
      fixture: 4,
      kickoff_time: "2099-01-01",
      expected_goals: 10000,
    });
    expect(scorePlayer(data, player, 9)).toBe(score);
  });
  it("has a finite deterministic fallback when history is missing", () => {
    const { data, player } = context();
    expect(playerForecast(data, player).historyMatches).toBe(0);
    expect(playerForecast(data, player).minutes).toBe(45);
    expect(Number.isFinite(scorePlayer(data, player, 9))).toBe(true);
    expect(scorePlayer(data, { ...player, minutes: 0, starts: 0 }, 9)).toBe(0);
  });
  it("does not amplify rare red-card risk merely because the incident was recent", () => {
    const { data, player } = context();
    player.minutes = 720;
    player.starts = 8;
    player.red_cards = 1;
    const rows = history(Array(8).fill(90)).map((row) => ({
      ...row,
      red_cards: 0,
    }));
    rows[7].red_cards = 1;
    data.histories = { "1": rows };
    const recent = playerForecast(data, player).red90;
    rows[7].red_cards = 0;
    rows[0].red_cards = 1;
    expect(playerForecast(data, player).red90).toBeCloseTo(recent);
    expect(recent * 3 * 4).toBeLessThan(0.5);
    expect(recent).toBeGreaterThan(0);
    expect(
      playerForecast(data, { ...player, red_cards: 3 }).red90,
    ).toBeGreaterThan(recent);
  });
  it("uses only observed eligible exposure when a rare-event season total is missing", () => {
    const { data, player } = context();
    const rows = history(Array(8).fill(90)).map((row) => ({
      ...row,
      red_cards: 0,
      own_goals: 0,
      penalties_missed: 0,
      penalties_saved: 0,
    }));
    Object.assign(rows[7], {
      red_cards: 1,
      own_goals: 1,
      penalties_missed: 1,
      penalties_saved: 1,
    });
    data.histories = {
      "1": [...rows, { ...rows[7], fixture: 9, round: 9, red_cards: 99 }],
    };
    const forecast = playerForecast(data, player);
    for (const value of [
      forecast.red90,
      forecast.ownGoals90,
      forecast.missedPenalties90,
      forecast.savedPenalties90,
    ]) {
      expect(value).toBeCloseTo(1 / 28);
    }
    delete data.histories["1"][0].red_cards;
    expect(playerForecast(data, player).red90).toBeCloseTo(1 / 27);
    expect(playerForecast(data, { ...player, red_cards: 0 }).red90).toBe(0);
    delete data.histories;
    expect(playerForecast(data, player).red90).toBe(0);
  });
  it("does not use last-match fantasy points as a forecasting input", () => {
    const { data, player } = context();
    data.histories = { "1": history(Array(8).fill(90)) };
    const before = scorePlayer(data, player, 9);
    data.histories["1"][7].total_points = -1;
    expect(scorePlayer(data, player, 9)).toBe(before);
  });
  it("adds bonus and subtracts disciplinary or own-goal risk", () => {
    const { data, player } = context();
    const base = scorePlayer(data, player, 9);
    expect(scorePlayer(data, { ...player, bonus: 9 }, 9)).toBeGreaterThan(base);
    expect(
      scorePlayer(
        data,
        { ...player, yellow_cards: 4, red_cards: 1, own_goals: 1 },
        9,
      ),
    ).toBeLessThan(base);
  });
});

describe("adaptive minutes", () => {
  it("recognises a returning starter while retaining uncertainty and older absences", () => {
    const { data, player } = context();
    player.minutes = 364;
    player.starts = 5;
    data.histories = { "1": history([0, 0, 0, 27, 71, 85, 71, 65]) };
    const forecast = playerForecast(data, player);
    expect(forecast.minutes).toBeGreaterThan(60);
    expect(forecast.minutes).toBeLessThan(73);
    expect(forecast.recentStartMinutes).toBe(73);
    expect(forecast.recentStartCount).toBe(4);
    expect(forecast.minutesBasis).toBe("recent-starts");
    expect(forecast.appearanceProbability).toBeLessThan(1);
    expect(forecast.startProbability).toBeLessThan(1);
    expect(forecast.sixtyProbability).toBeLessThan(1);
    expect(
      forecast.outcomes.some(
        (outcome) => outcome.minutes === 0 && outcome.probability > 0,
      ),
    ).toBe(true);
    player.status = "i";
    expect(playerForecast(data, player).minutes).toBe(forecast.minutes);
    expect(scorePlayer(data, player, 9)).toBe(0);
  });

  it.each([0, 20])(
    "reacts immediately to a renewed %i-minute absence or cameo",
    (minutes) => {
      const { data, player } = context();
      data.histories = { "1": history([0, 0, 0, 27, 71, 85, 71, 65]) };
      const established = playerForecast(data, player);
      Object.assign(data.histories["1"][7], { minutes, starts: 0 });
      const interrupted = playerForecast(data, player);
      expect(interrupted.minutesBasis).toBe("blended");
      expect(interrupted.minutes).toBeLessThan(established.minutes);
      expect(interrupted.startProbability).toBeLessThan(
        established.startProbability,
      );
      expect(interrupted.sixtyProbability).toBeLessThan(
        established.sixtyProbability,
      );
    },
  );

  it.each([
    [0, 90, 0, 90, 0, 90, 0, 90],
    [0, 0, 0, 0, 0, 0, 0, 90],
  ])(
    "preserves the existing conservative blend for rotation and one-off starts: %j",
    (...minutes) => {
      const { data, player } = context();
      data.histories = { "1": history(minutes) };
      const forecast = playerForecast(data, player);
      // Freeze the previous model's result: two season-equivalent observations
      // combined with an eight-match history having a three-match half-life.
      const ordered = [...minutes].reverse();
      const weights = ordered.map((_, index) => 2 ** (-index / 3));
      const denominator = 2 + weights.reduce((sum, value) => sum + value, 0);
      const expected =
        (2 * 45 +
          ordered.reduce(
            (sum, value, index) => sum + value * weights[index],
            0,
          )) /
        denominator;
      expect(forecast.minutes).toBeCloseTo(expected);
      expect(forecast.minutesBasis).toBe("blended");
    },
  );

  it("requires complete recent coverage, and retains missing-history fallbacks", () => {
    const { data, player } = context();
    expect(playerForecast(data, player)).toMatchObject({
      minutes: 45,
      minutesBasis: "season",
      recentStartMinutes: null,
      recentStartCount: 0,
    });
    const rows = history(Array(8).fill(90));
    data.histories = { "1": rows.slice(5) };
    expect(playerForecast(data, player)).toMatchObject({
      minutesBasis: "blended",
      recentStartCount: 3,
    });
    data.histories["1"] = rows.filter((row) => row.fixture !== 7);
    expect(playerForecast(data, player).minutesBasis).toBe("blended");
    data.histories["1"] = rows.slice(4);
    expect(playerForecast(data, player).minutesBasis).toBe("recent-starts");
  });

  it("changes usage without reweighting performance rates", () => {
    const { data, player } = context();
    data.histories = { "1": history([0, 0, 0, 27, 71, 85, 71, 65]) };
    const adaptive = playerForecast(data, player);
    // Change only starting-role evidence; identical minutes and events must
    // retain identical per-90 performance rates.
    data.histories["1"][7].starts = 0;
    const blended = playerForecast(data, player);
    expect(adaptive.minutes).toBeGreaterThan(blended.minutes);
    for (const field of [
      "xg90",
      "xa90",
      "xgc90",
      "defensive90",
      "saves90",
      "bonus90",
      "yellow90",
      "red90",
      "ownGoals90",
      "missedPenalties90",
      "savedPenalties90",
    ] as const) {
      expect(adaptive[field]).toBe(blended[field]);
    }
  });

  it.each([
    [],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 27, 71, 85, 71, 65],
    [90, 90, 90, 90, 90, 90, 90, 90],
    [0, 20, 90, 0, 20, 90, 0, 20],
  ])(
    "keeps distributions normalised and probabilities coherent: %j",
    (...minutes) => {
      const { data, player } = context();
      data.histories = { "1": history(minutes) };
      const forecast = playerForecast(data, player);
      expect(
        forecast.outcomes.reduce(
          (sum, outcome) => sum + outcome.probability,
          0,
        ),
      ).toBeCloseTo(1);
      expect(forecast.minutes).toBeGreaterThanOrEqual(0);
      expect(forecast.minutes).toBeLessThanOrEqual(90);
      for (const probability of [
        forecast.appearanceProbability,
        forecast.sixtyProbability,
        forecast.startProbability,
        ...forecast.outcomes.map((outcome) => outcome.probability),
      ]) {
        expect(probability).toBeGreaterThanOrEqual(0);
        expect(probability).toBeLessThanOrEqual(1 + Number.EPSILON);
      }
      expect(forecast.sixtyProbability).toBeLessThanOrEqual(
        forecast.appearanceProbability,
      );
    },
  );
});

describe("opponents and availability", () => {
  it("uses separate venue-specific opponent attack and defence", () => {
    const { data, player } = context();
    data.bootstrap.teams.forEach((team) =>
      Object.assign(team, {
        strength_attack_home: 1000,
        strength_attack_away: 1000,
        strength_defence_home: 1000,
        strength_defence_away: 1000,
      }),
    );
    const fixture = data.fixtures[8];
    const neutral = opponentFactors(data, player, fixture);
    data.bootstrap.teams[1].strength_defence_away = 1500;
    const strongDefence = opponentFactors(data, player, fixture);
    expect(strongDefence.attack).toBeLessThan(neutral.attack);
    expect(strongDefence.conceded).toBe(neutral.conceded);
    data.bootstrap.teams[1].strength_attack_away = 1500;
    expect(opponentFactors(data, player, fixture).conceded).toBeGreaterThan(
      neutral.conceded,
    );
  });
  it("falls back to difficulty when team strengths are absent", () => {
    const { data, player } = context();
    data.fixtures[8].team_h_difficulty = 5;
    expect(opponentFactors(data, player, data.fixtures[8])).toEqual({
      attack: 0.76,
      conceded: 1.3,
    });
  });
  it("changes later weeks only under the explicit recovery scenario", () => {
    const { data, player } = context();
    player.status = "i";
    expect(scorePlayer(data, player, 9, "recover-next-week")).toBe(0);
    expect(scorePlayer(data, player, 10, "persistent")).toBe(0);
    expect(scorePlayer(data, player, 10, "recover-next-week")).toBeGreaterThan(
      0,
    );
    player.status = "u";
    expect(weekAvailability(data, player, 10, "recover-next-week")).toBe(0);
  });
});
