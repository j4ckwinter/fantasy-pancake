import type { Data, History, Player } from "../schemas";
import { upcomingWeeks } from "./schedule";
import { forecastMinutes, type MinutesForecast } from "./minutes-forecast";
import { fullMatches } from "./match-minutes";
import { positionOf, type Position } from "./position";
import { recencyWeight } from "./recency";

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

const ATTACKING_PRIORS: Record<Position, { goals: number; assists: number }> = {
  1: { goals: 0.01, assists: 0.01 },
  2: { goals: 0.06, assists: 0.08 },
  3: { goals: 0.2, assists: 0.15 },
  4: { goals: 0.35, assists: 0.1 },
};
const GOALS_CONCEDED_PRIOR = 1.4;
const MAX_HISTORY_MATCHES = 8;
const SEASON_PRIOR_MATCHES = 5;
const RECENT_RATE_SEASON_WEIGHT = 2;
const RARE_EVENT_PRIOR_MATCHES = 20;

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
    .slice(0, MAX_HISTORY_MATCHES);
}

export function playerForecast(data: Data, player: Player): PlayerForecast {
  const rows = usableHistory(data, player);
  const weighted = rows.map((row, index) => ({
    row,
    weight: recencyWeight(index),
  }));
  const priorWeight = RECENT_RATE_SEASON_WEIGHT;
  const exposure = fullMatches(player.minutes);
  const weightedExposure = weighted.reduce(
    (sum, sample) => sum + fullMatches(sample.weight * sample.row.minutes),
    0,
  );
  const rate = (field: keyof History[number], total: number, prior: number) => {
    const seasonRate =
      (total + SEASON_PRIOR_MATCHES * prior) /
      (exposure + SEASON_PRIOR_MATCHES);
    if (!rows.length) return seasonRate;
    const samples = weighted.filter(
      ({ row }) => typeof row[field] === "number",
    );
    if (!samples.length) return seasonRate;
    const sampleExposure =
      samples.length === weighted.length
        ? weightedExposure
        : samples.reduce(
            (sum, sample) =>
              sum + fullMatches(sample.weight * sample.row.minutes),
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
    if (seasonTotal !== undefined)
      return seasonTotal / (exposure + RARE_EVENT_PRIOR_MATCHES);
    const observed = rows.filter((row) => row[field] !== undefined);
    const observedExposure = observed.reduce(
      (sum, row) => sum + fullMatches(row.minutes),
      0,
    );
    return (
      observed.reduce((sum, row) => sum + (row[field] ?? 0), 0) /
      (observedExposure + RARE_EVENT_PRIOR_MATCHES)
    );
  };
  const priors = ATTACKING_PRIORS[positionOf(player)];
  return {
    ...forecastMinutes(data, player, rows),
    historyMatches: rows.length,
    xg90: rate("expected_goals", player.expected_goals, priors.goals),
    xa90: rate("expected_assists", player.expected_assists, priors.assists),
    xgc90: rate(
      "expected_goals_conceded",
      player.expected_goals_conceded,
      GOALS_CONCEDED_PRIOR,
    ),
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
