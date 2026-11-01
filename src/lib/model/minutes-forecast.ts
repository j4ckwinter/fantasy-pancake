import type { Data, History, Player } from "../schemas";
import { upcomingWeeks } from "./schedule";

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

/** Rows must be eligible completed matches, newest first (see usableHistory). */
export function forecastMinutes(
  data: Data,
  player: Player,
  rows: History,
): MinutesForecast {
  const completed = Math.max(
    1,
    data.fixtures.filter(
      (fixture) =>
        fixture.finished &&
        (fixture.team_h === player.team || fixture.team_a === player.team),
    ).length,
  );
  const seasonMinutes = clamp(player.minutes / completed, 0, 90);
  const startProbability = clamp(
    Math.min(player.starts / completed, seasonMinutes / 60),
  );
  const startMinutes =
    startProbability > 0 ? clamp(seasonMinutes / startProbability, 60, 90) : 0;
  const residualMinutes = Math.max(
    0,
    seasonMinutes - startProbability * startMinutes,
  );
  const subProbability = Math.min(1 - startProbability, residualMinutes / 20);
  const subMinutes =
    subProbability > 0 ? Math.min(59, residualMinutes / subProbability) : 0;
  const fallback: MinuteOutcome[] = [
    { minutes: startMinutes, probability: startProbability },
    { minutes: subMinutes, probability: subProbability },
    {
      minutes: 0,
      probability: Math.max(0, 1 - startProbability - subProbability),
    },
  ];
  const recentStarts = rows
    .slice(0, 4)
    .filter((row) => row.starts >= 1 && row.minutes > 0);
  // Four consecutive starts provide evidence of a current role. Older absences
  // still contribute; a new absence or cameo restores the conservative blend.
  // Zero minutes alone cannot tell us whether a player was injured or dropped.
  const cutoff = Date.parse(data.fetchedAt);
  const nextWeek = upcomingWeeks(data)[0] ?? Infinity;
  const recentTeamFixtures = data.fixtures
    .filter(
      (fixture) =>
        fixture.finished &&
        (fixture.team_h === player.team || fixture.team_a === player.team) &&
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
    .slice(0, 4);
  const establishedRecentRole =
    recentStarts.length === 4 &&
    recentTeamFixtures.length === 4 &&
    recentTeamFixtures.every(
      (fixture, index) => fixture.id === rows[index].fixture,
    );
  const weighted = rows.map((row, index) => ({
    row,
    weight:
      2 ** (-index / 3) * (establishedRecentRole && index >= 4 ? 0.25 : 1),
  }));
  const weight = weighted.reduce((sum, sample) => sum + sample.weight, 0);
  const priorWeight = establishedRecentRole ? 0.5 : 2;
  const outcomes = rows.length
    ? [
        ...fallback.map((outcome) => ({
          ...outcome,
          probability:
            (outcome.probability * priorWeight) / (weight + priorWeight),
        })),
        ...weighted.map(({ row, weight: sampleWeight }) => ({
          minutes: clamp(row.minutes, 0, 90),
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
      (sum, outcome) => sum + (outcome.minutes >= 60 ? outcome.probability : 0),
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
    recentStartMinutes: recentStarts.length
      ? recentStarts.reduce((sum, row) => sum + clamp(row.minutes, 0, 90), 0) /
        recentStarts.length
      : null,
    recentStartCount: recentStarts.length,
    minutesBasis: establishedRecentRole
      ? "recent-starts"
      : rows.length
        ? "blended"
        : "season",
  };
}
