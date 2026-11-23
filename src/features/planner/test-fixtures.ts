import type { Data } from "@/lib/schemas";

export function seasonData(deadline = "2026-08-14T17:30:00Z"): Data {
  return {
    fetchedAt: "2026-10-31T18:00:00Z",
    fixtures: [],
    bootstrap: {
      elements: Array.from({ length: 15 }, (_, i) => ({
        id: i + 1,
        web_name: `Player ${i + 1}`,
        team: i + 1,
        element_type: 1,
        now_cost: 50 + i,
        status: "a",
        news: "",
        can_select: true,
        can_transact: true,
        chance_of_playing_next_round: null,
        minutes: 0,
        starts: 0,
        expected_goals: 0,
        expected_assists: 0,
        expected_goals_conceded: 0,
        defensive_contribution: 0,
        saves: 0,
        creativity: 0,
        penalties_order: null,
        corners_and_indirect_freekicks_order: null,
        direct_freekicks_order: null,
      })),
      teams: [],
      events: [
        {
          id: 1,
          name: "Gameweek 1",
          deadline_time: deadline,
          finished: false,
          is_current: false,
          is_next: true,
        },
      ],
      element_types: [],
      game_settings: {
        squad_squadsize: 15,
        squad_squadplay: 11,
        squad_team_limit: 3,
        max_extra_free_transfers: 4,
      },
    },
  };
}

export function memoryStorage(saved: string | null = null) {
  let value = saved;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
  };
}
