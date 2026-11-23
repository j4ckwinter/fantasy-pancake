import type { Data, Player, Settings } from "../schemas";

export const SQUAD_SHAPE = [1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4];
export const STAR_ID = 100;

export function player(
  id: number,
  position: number,
  team: number,
  overrides: Partial<Player> = {},
): Player {
  return {
    id,
    web_name: `Player ${id}`,
    team,
    element_type: position,
    now_cost: 50,
    status: "a",
    news: "",
    can_select: true,
    can_transact: true,
    chance_of_playing_next_round: 100,
    minutes: 900,
    starts: 10,
    expected_goals: 1,
    expected_assists: 1,
    expected_goals_conceded: 12,
    defensive_contribution: 50,
    saves: 20,
    creativity: 100,
    penalties_order: null,
    corners_and_indirect_freekicks_order: null,
    direct_freekicks_order: null,
    ...overrides,
  };
}

export function positionRules(): Data["bootstrap"]["element_types"] {
  return [
    {
      id: 1,
      singular_name_short: "GKP",
      squad_select: 2,
      squad_min_play: 1,
      squad_max_play: 1,
    },
    {
      id: 2,
      singular_name_short: "DEF",
      squad_select: 5,
      squad_min_play: 3,
      squad_max_play: 5,
    },
    {
      id: 3,
      singular_name_short: "MID",
      squad_select: 5,
      squad_min_play: 2,
      squad_max_play: 5,
    },
    {
      id: 4,
      singular_name_short: "FWD",
      squad_select: 3,
      squad_min_play: 1,
      squad_max_play: 3,
    },
  ];
}

export function gameSettings(): Data["bootstrap"]["game_settings"] {
  return {
    squad_squadsize: 15,
    squad_squadplay: 11,
    squad_team_limit: 3,
    max_extra_free_transfers: 4,
  };
}

export function squadPlayers(overrides: Partial<Player> = {}): Player[] {
  return SQUAD_SHAPE.map((position, index) =>
    player(index + 1, position, Math.floor(index / 3) + 1, overrides),
  );
}

export function seasonData(): Data {
  const fixtures = Array.from({ length: 14 }, (_, index) =>
    Array.from({ length: 6 }, (_, team) => ({
      id: index * 6 + team + 1,
      event: index + 1,
      team_h: team + 1,
      team_a: 20,
      team_h_difficulty: 3,
      team_a_difficulty: 3,
      finished: index < 10,
      kickoff_time: "2026-10-01T12:00:00Z",
    })),
  ).flat();
  return {
    fetchedAt: "2026-10-01T12:00:00Z",
    fixtures,
    bootstrap: {
      elements: squadPlayers(),
      teams: Array.from({ length: 20 }, (_, i) => ({
        id: i + 1,
        name: `Club ${i + 1}`,
        short_name: `C${i + 1}`,
      })),
      events: Array.from({ length: 14 }, (_, i) => ({
        id: i + 1,
        name: `Gameweek ${i + 1}`,
        deadline_time: "2026-10-01T12:00:00Z",
        is_current: i === 9,
        is_next: i === 10,
        finished: i < 10,
      })),
      element_types: positionRules(),
      game_settings: gameSettings(),
    },
  };
}

export function settingsFor(
  data: Data,
  overrides: Partial<Settings> = {},
): Settings {
  return {
    version: 1,
    entryId: 1,
    sourceGameweek: 10,
    season: "2026",
    bank: 0,
    freeTransfers: 1,
    squad: data.bootstrap.elements
      .slice(0, SQUAD_SHAPE.length)
      .map((p) => ({ id: p.id, sellingPrice: p.now_cost })),
    ...overrides,
  };
}

export function seasonContext() {
  const data = seasonData();
  return { data, settings: settingsFor(data) };
}

export function addPlayer(data: Data, overrides: Partial<Player> = {}): Player {
  const added = player(STAR_ID, 3, 6, {
    expected_goals: 12,
    expected_assists: 8,
    ...overrides,
  });
  data.bootstrap.elements.push(added);
  return added;
}
