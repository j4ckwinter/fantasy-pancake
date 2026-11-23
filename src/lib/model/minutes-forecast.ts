import type { Data, History, Player } from "../schemas";
import { finishedTeamFixtures, upcomingWeeks } from "./schedule";
import { FULL_MATCH_MINUTES, LONG_APPEARANCE_MINUTES } from "./match-minutes";
import { recencyWeight } from "./recency";

export type MinuteOutcome = { minutes: number; probability: number };
export type MinutesForecast = {
  minutes: number;
  appearanceProbability: number;
  sixtyProbability: number;
  startProbability: number;
  outcomes: MinuteOutcome[];
  /** Observed mean among starts in the latest four eligible matches. */
  recentStartMinutes: number | null;
  recentStartCount: number;
  minutesBasis: "recent-starts" | "blended" | "season";
};
const clamp = (value: number, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value));
const MAX_SUBSTITUTE_MINUTES = LONG_APPEARANCE_MINUTES - 1;
const TYPICAL_SUBSTITUTE_MINUTES = 20;
const RECENT_ROLE_MATCHES = 4;
const OLDER_USAGE_WEIGHT_IN_RECENT_ROLE = 0.25;
const SEASON_MINUTES_PRIOR_MATCHES = 2;
const RECENT_ROLE_SEASON_MINUTES_PRIOR_MATCHES = 0.5;

function completedMatches(data: Data, player: Player): number {
  return Math.max(1, finishedTeamFixtures(data.fixtures, player.team).length);
}

export function seasonMinutesPerMatch(data: Data, player: Player): number {
  return clamp(
    player.minutes / completedMatches(data, player),
    0,
    FULL_MATCH_MINUTES,
  );
}

function seasonMinuteOutcomes(
  data: Data,
  player: Player,
): { outcomes: MinuteOutcome[]; startProbability: number } {
  const completed = completedMatches(data, player);
  const seasonMinutes = seasonMinutesPerMatch(data, player);
  const startProbability = clamp(
    Math.min(
      player.starts / completed,
      seasonMinutes / LONG_APPEARANCE_MINUTES,
    ),
  );
  const startMinutes =
    startProbability > 0
      ? clamp(
          seasonMinutes / startProbability,
          LONG_APPEARANCE_MINUTES,
          FULL_MATCH_MINUTES,
        )
      : 0;
  const residualMinutes = Math.max(
    0,
    seasonMinutes - startProbability * startMinutes,
  );
  const subProbability = Math.min(
    1 - startProbability,
    residualMinutes / TYPICAL_SUBSTITUTE_MINUTES,
  );
  const subMinutes =
    subProbability > 0
      ? Math.min(MAX_SUBSTITUTE_MINUTES, residualMinutes / subProbability)
      : 0;
  const outcomes: MinuteOutcome[] = [
    { minutes: startMinutes, probability: startProbability },
    { minutes: subMinutes, probability: subProbability },
    {
      minutes: 0,
      probability: Math.max(0, 1 - startProbability - subProbability),
    },
  ];
  return { outcomes, startProbability };
}

function recentStarts(rows: History): History {
  return rows
    .slice(0, RECENT_ROLE_MATCHES)
    .filter((row) => row.starts >= 1 && row.minutes > 0);
}

// Four consecutive starts provide evidence of a current role. Older absences
// still contribute; a new absence or cameo restores the conservative blend.
// Zero minutes alone cannot tell us whether a player was injured or dropped.
function hasEstablishedRecentRole(
  data: Data,
  player: Player,
  rows: History,
): boolean {
  const cutoff = Date.parse(data.fetchedAt);
  const nextWeek = upcomingWeeks(data)[0] ?? Infinity;
  const recentTeamFixtures = finishedTeamFixtures(data.fixtures, player.team)
    .filter(
      (fixture) =>
        fixture.event !== null &&
        fixture.event < nextWeek &&
        fixture.kickoff_time !== null &&
        Date.parse(fixture.kickoff_time) < cutoff,
    )
    .sort(
      (a, b) =>
        Date.parse(b.kickoff_time!) - Date.parse(a.kickoff_time!) ||
        b.id - a.id,
    )
    .slice(0, RECENT_ROLE_MATCHES);
  return (
    recentStarts(rows).length === RECENT_ROLE_MATCHES &&
    recentTeamFixtures.length === RECENT_ROLE_MATCHES &&
    recentTeamFixtures.every(
      (fixture, index) => fixture.id === rows[index].fixture,
    )
  );
}

/** Rows must be eligible completed matches, newest first (see usableHistory). */
export function forecastMinutes(
  data: Data,
  player: Player,
  rows: History,
): MinutesForecast {
  const { outcomes: fallback, startProbability } = seasonMinuteOutcomes(
    data,
    player,
  );
  const starts = recentStarts(rows);
  const establishedRecentRole = hasEstablishedRecentRole(data, player, rows);
  const weighted = rows.map((row, index) => ({
    row,
    weight:
      recencyWeight(index) *
      (establishedRecentRole && index >= RECENT_ROLE_MATCHES
        ? OLDER_USAGE_WEIGHT_IN_RECENT_ROLE
        : 1),
  }));
  const weight = weighted.reduce((sum, sample) => sum + sample.weight, 0);
  const priorWeight = establishedRecentRole
    ? RECENT_ROLE_SEASON_MINUTES_PRIOR_MATCHES
    : SEASON_MINUTES_PRIOR_MATCHES;
  const outcomes = rows.length
    ? [
        ...fallback.map((outcome) => ({
          ...outcome,
          probability:
            (outcome.probability * priorWeight) / (weight + priorWeight),
        })),
        ...weighted.map(({ row, weight: sampleWeight }) => ({
          minutes: clamp(row.minutes, 0, FULL_MATCH_MINUTES),
          probability: sampleWeight / (weight + priorWeight),
        })),
      ]
    : fallback;
  return {
    minutes: outcomes.reduce(
      (sum, outcome) => sum + outcome.minutes * outcome.probability,
      0,
    ),
    appearanceProbability: outcomes.reduce(
      (sum, outcome) => sum + (outcome.minutes > 0 ? outcome.probability : 0),
      0,
    ),
    sixtyProbability: outcomes.reduce(
      (sum, outcome) =>
        sum +
        (outcome.minutes >= LONG_APPEARANCE_MINUTES ? outcome.probability : 0),
      0,
    ),
    startProbability: rows.length
      ? (priorWeight * startProbability +
          weighted.reduce(
            (sum, sample) =>
              sum + sample.weight * Math.min(1, sample.row.starts),
            0,
          )) /
        (weight + priorWeight)
      : startProbability,
    outcomes,
    recentStartMinutes: starts.length
      ? starts.reduce(
          (sum, row) => sum + clamp(row.minutes, 0, FULL_MATCH_MINUTES),
          0,
        ) / starts.length
      : null,
    recentStartCount: starts.length,
    minutesBasis: establishedRecentRole
      ? "recent-starts"
      : rows.length
        ? "blended"
        : "season",
  };
}
