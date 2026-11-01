import type { Data, Player } from "../schemas";

export function upcomingWeeks(data: Data): number[] {
  const events = [...data.bootstrap.events].sort((a, b) => a.id - b.id);
  const next =
    events.find((event) => event.is_next) ??
    (!events.some((event) => event.is_current)
      ? events.find((event) => !event.finished)
      : undefined);
  return next
    ? events
        .filter((event) => event.id >= next.id)
        .slice(0, 4)
        .map((event) => event.id)
    : [];
}

export function fixturesFor(
  data: Data,
  player: Player,
  weeks: number[],
): string[] {
  return weeks.map((week) => {
    const fixtures = data.fixtures.filter(
      (fixture) =>
        fixture.event === week &&
        !fixture.finished &&
        (fixture.team_h === player.team || fixture.team_a === player.team),
    );
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
