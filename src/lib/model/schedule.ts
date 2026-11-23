import type { Data, Fixture, Player } from "../schemas";

const HORIZON_WEEKS = 4;

export function upcomingWeeks(data: {
  bootstrap: Pick<Data["bootstrap"], "events">;
}): number[] {
  const events = [...data.bootstrap.events].sort((a, b) => a.id - b.id);
  const next =
    events.find((event) => event.is_next) ??
    (!events.some((event) => event.is_current)
      ? events.find((event) => !event.finished)
      : undefined);
  return next
    ? events
        .filter((event) => event.id >= next.id)
        .slice(0, HORIZON_WEEKS)
        .map((event) => event.id)
    : [];
}

export function playsIn(fixture: Fixture, team: number): boolean {
  return fixture.team_h === team || fixture.team_a === team;
}

export function scheduledTeamFixtures(
  fixtures: Fixture[],
  team: number,
  week: number,
): Fixture[] {
  return fixtures.filter(
    (fixture) =>
      fixture.event === week && !fixture.finished && playsIn(fixture, team),
  );
}

export function finishedTeamFixtures(
  fixtures: Fixture[],
  team: number,
): Fixture[] {
  return fixtures.filter(
    (fixture) => fixture.finished && playsIn(fixture, team),
  );
}

export function fixturesFor(
  data: Data,
  player: Player,
  weeks: number[],
): string[] {
  return weeks.map((week) => {
    const fixtures = scheduledTeamFixtures(data.fixtures, player.team, week);
    const labels = fixtures.map((fixture) => {
      const home = fixture.team_h === player.team;
      const opponent = data.bootstrap.teams.find(
        (team) => team.id === (home ? fixture.team_a : fixture.team_h),
      );
      return `${opponent?.short_name ?? "Unknown"} (${home ? "H" : "A"}, difficulty ${home ? fixture.team_h_difficulty : fixture.team_a_difficulty})`;
    });
    return `GW${week}: ${labels.join(" + ") || "Blank / no scheduled fixture"}`;
  });
}
