import type { Data, History, Player } from "../schemas";
import { upcomingWeeks } from "./schedule";
import { forecastMinutes, type MinutesForecast } from "./minutes-forecast";

export type { MinuteOutcome } from "./minutes-forecast";

export type PlayerForecast = MinutesForecast & {
  historyMatches: number;
  xg90: number;
  xa90: number;
  xgc90: number;
  defensive90: number;
  saves90: number;
  bonus90: number;
  yellow90: number;
  red90: number;
  ownGoals90: number;
  missedPenalties90: number;
  savedPenalties90: number;
};
const goalPriors = [0, 0.01, 0.06, 0.2, 0.35];
const assistPriors = [0, 0.01, 0.08, 0.15, 0.1];

export function usableHistory(data: Data, player: Player): History {
  const cutoff = Date.parse(data.fetchedAt);
  const nextWeek = upcomingWeeks(data)[0] ?? Infinity;
  const completed = new Set(
    data.fixtures
      .filter((fixture) => fixture.finished)
      .map((fixture) => fixture.id),
  );
  const seen = new Set<number>();
  return [...(data.histories?.[String(player.id)] ?? [])]
    .filter(
      (row) =>
        Number.isFinite(cutoff) &&
        Date.parse(row.kickoff_time) < cutoff &&
        row.round < nextWeek &&
        completed.has(row.fixture),
    )
    .sort(
      (a, b) =>
        Date.parse(b.kickoff_time) - Date.parse(a.kickoff_time) ||
        b.fixture - a.fixture,
    )
    .filter((row) => {
      if (seen.has(row.fixture)) return false;
      seen.add(row.fixture);
      return true;
    })
    .slice(0, 8);
}

export function playerForecast(data: Data, player: Player): PlayerForecast {
  const rows = usableHistory(data, player);
  const weighted = rows.map((row, index) => ({
    row,
    weight: 2 ** (-index / 3),
  }));
  const priorWeight = 2;
  const exposure = player.minutes / 90;
  const weightedExposure = weighted.reduce(
    (sum, sample) => sum + (sample.weight * sample.row.minutes) / 90,
    0,
  );
  const rate = (field: keyof History[number], total: number, prior: number) => {
    const seasonRate = (total + 5 * prior) / (exposure + 5);
    if (!rows.length) return seasonRate;
    const samples = weighted.filter(
      ({ row }) => typeof row[field] === "number",
    );
    if (!samples.length) return seasonRate;
    const sampleExposure =
      samples.length === weighted.length
        ? weightedExposure
        : samples.reduce(
            (sum, sample) => sum + (sample.weight * sample.row.minutes) / 90,
            0,
          );
    return (
      (samples.reduce(
        (sum, sample) => sum + Number(sample.row[field]) * sample.weight,
        0,
      ) +
        priorWeight * seasonRate) /
      (sampleExposure + priorWeight)
    );
  };
  const rareEventRate = (
    field: "red_cards" | "own_goals" | "penalties_missed" | "penalties_saved",
    seasonTotal: number | undefined,
  ) => {
    const priorExposure = 20;
    if (seasonTotal !== undefined)
      return seasonTotal / (exposure + priorExposure);
    const observed = rows.filter((row) => row[field] !== undefined);
    const observedExposure = observed.reduce(
      (sum, row) => sum + row.minutes / 90,
      0,
    );
    return (
      observed.reduce((sum, row) => sum + (row[field] ?? 0), 0) /
      (observedExposure + priorExposure)
    );
  };
  return {
    ...forecastMinutes(data, player, rows),
    historyMatches: rows.length,
    xg90: rate(
      "expected_goals",
      player.expected_goals,
      goalPriors[player.element_type],
    ),
    xa90: rate(
      "expected_assists",
      player.expected_assists,
      assistPriors[player.element_type],
    ),
    xgc90: rate("expected_goals_conceded", player.expected_goals_conceded, 1.4),
    defensive90: rate(
      "defensive_contribution",
      player.defensive_contribution,
      0,
    ),
    saves90: rate("saves", player.saves, 0),
    bonus90: rate("bonus", player.bonus ?? 0, 0),
    yellow90: rate("yellow_cards", player.yellow_cards ?? 0, 0),
    red90: rareEventRate("red_cards", player.red_cards),
    ownGoals90: rareEventRate("own_goals", player.own_goals),
    missedPenalties90: rareEventRate(
      "penalties_missed",
      player.penalties_missed,
    ),
    savedPenalties90: rareEventRate("penalties_saved", player.penalties_saved),
  };
}
