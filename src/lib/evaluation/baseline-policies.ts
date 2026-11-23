import type { Data, Player, Settings } from "../schemas";
import { scheduledTeamFixtures } from "../model/schedule";
import { seasonMinutesPerMatch } from "../model/minutes-forecast";
import { fullMatches } from "../model/match-minutes";

const FIXTURE_EASE_BASE = 6;
const LAGGED_POINTS_MATCHES = 6;

type PlayerWeekForecast = (player: Player, week: number) => number;

function weeklyForecast(
  data: Data,
  weeks: number[],
  forecast: PlayerWeekForecast,
): Map<number, number>[] {
  return weeks.map(
    (week) =>
      new Map(
        data.bootstrap.elements.map((player) => [
          player.id,
          forecast(player, week),
        ]),
      ),
  );
}

export function minutesAndFixturesScores(
  data: Data,
  weeks: number[],
): Map<number, number>[] {
  return weeklyForecast(data, weeks, (player, week) => {
    const minutes = seasonMinutesPerMatch(data, player);
    return scheduledTeamFixtures(data.fixtures, player.team, week).reduce(
      (sum, fixture) =>
        sum +
        fullMatches(minutes) *
          (FIXTURE_EASE_BASE -
            (fixture.team_h === player.team
              ? fixture.team_h_difficulty
              : fixture.team_a_difficulty)),
      0,
    );
  });
}

export function laggedPointsScores(
  data: Data,
  weeks: number[],
): Map<number, number>[] {
  return weeklyForecast(data, weeks, (player, week) => {
    const rows = [...(data.histories?.[String(player.id)] ?? [])]
      .sort((a, b) => Date.parse(b.kickoff_time) - Date.parse(a.kickoff_time))
      .slice(0, LAGGED_POINTS_MATCHES);
    return rows.length
      ? (rows.reduce((sum, row) => sum + row.total_points, 0) / rows.length) *
          scheduledTeamFixtures(data.fixtures, player.team, week).length
      : 0;
  });
}

export function seasonPointsPerMatchScores(
  data: Data,
  weeks: number[],
): Map<number, number>[] {
  return weeklyForecast(data, weeks, (player, week) => {
    const rows = data.histories?.[String(player.id)] ?? [];
    return rows.length
      ? (rows.reduce((sum, row) => sum + row.total_points, 0) / rows.length) *
          scheduledTeamFixtures(data.fixtures, player.team, week).length
      : 0;
  });
}

export function squadHistoryCoverage(
  data: Data,
  squad: Settings["squad"],
): number {
  return (
    squad.filter((pick) => (data.histories?.[String(pick.id)]?.length ?? 0) > 0)
      .length / squad.length
  );
}
