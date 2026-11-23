import type { Data, Fixture, Player } from "../schemas";
import type { ArchiveRow, SeasonArchive } from "./backtest-schema";

export type DeadlineInputs = {
  data: Data;
  ownership: ReadonlyMap<number, number>;
};

export function deadlineOf(archive: SeasonArchive, event: number): string {
  const found = archive.bootstrap.events.find((item) => item.id === event);
  if (!found) throw new Error(`Gameweek ${event} is not in the archive.`);
  return found.deadline_time;
}

export function rowsBefore(
  rows: readonly ArchiveRow[],
  event: number,
  deadline: string,
): ArchiveRow[] {
  const cutoff = Date.parse(deadline);
  return rows.filter(
    (row) => row.round < event && Date.parse(row.kickoff_time) < cutoff,
  );
}

function teamOf(row: ArchiveRow, fixtures: ReadonlyMap<number, Fixture>) {
  const fixture = fixtures.get(row.fixture);
  if (!fixture) return undefined;
  return row.was_home === false ? fixture.team_a : fixture.team_h;
}

function latest(rows: readonly ArchiveRow[]): ArchiveRow {
  return rows.reduce((last, row) =>
    Date.parse(row.kickoff_time) > Date.parse(last.kickoff_time) ? row : last,
  );
}

const total = (rows: readonly ArchiveRow[], field: keyof ArchiveRow) =>
  rows.reduce((sum, row) => sum + Number(row[field] ?? 0), 0);

function playerAtDeadline(
  current: Player,
  rows: readonly ArchiveRow[],
  fixtures: ReadonlyMap<number, Fixture>,
): Player {
  const last = latest(rows);
  return {
    ...current,
    team: teamOf(last, fixtures) ?? current.team,
    now_cost: last.value,
    status: "a",
    news: "",
    can_select: true,
    can_transact: true,
    chance_of_playing_next_round: null,
    minutes: total(rows, "minutes"),
    starts: total(rows, "starts"),
    expected_goals: total(rows, "expected_goals"),
    expected_assists: total(rows, "expected_assists"),
    expected_goals_conceded: total(rows, "expected_goals_conceded"),
    defensive_contribution: total(rows, "defensive_contribution"),
    saves: total(rows, "saves"),
    creativity: total(rows, "creativity"),
    bonus: total(rows, "bonus"),
    yellow_cards: total(rows, "yellow_cards"),
    red_cards: total(rows, "red_cards"),
    own_goals: total(rows, "own_goals"),
    penalties_missed: total(rows, "penalties_missed"),
    penalties_saved: total(rows, "penalties_saved"),
    penalties_order: null,
    corners_and_indirect_freekicks_order: null,
    direct_freekicks_order: null,
  };
}

export function inputsAtDeadline(
  archive: SeasonArchive,
  event: number,
): DeadlineInputs {
  const deadline = deadlineOf(archive, event);
  const cutoff = Date.parse(deadline);
  const fixturesById = new Map(
    archive.fixtures.map((fixture) => [fixture.id, fixture]),
  );
  const elements: Player[] = [];
  const histories: Record<string, ArchiveRow[]> = {};
  const ownership = new Map<number, number>();
  for (const current of archive.bootstrap.elements) {
    const rows = rowsBefore(
      archive.histories[String(current.id)] ?? [],
      event,
      deadline,
    );
    if (!rows.length) continue;
    elements.push(playerAtDeadline(current, rows, fixturesById));
    histories[String(current.id)] = rows;
    ownership.set(current.id, latest(rows).selected);
  }
  const fixtures = archive.fixtures.map((fixture) => ({
    ...fixture,
    finished:
      fixture.finished &&
      fixture.kickoff_time !== null &&
      Date.parse(fixture.kickoff_time) < cutoff,
  }));
  const events = archive.bootstrap.events.map((item) => ({
    ...item,
    is_current: item.id === event - 1,
    is_next: item.id === event,
    finished: item.id < event,
  }));
  return {
    data: {
      fetchedAt: deadline,
      fixtures,
      histories,
      bootstrap: { ...archive.bootstrap, elements, events },
    },
    ownership,
  };
}
