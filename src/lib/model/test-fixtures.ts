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

export const SYNTHETIC_LEAGUE_PLAYERS = 700;
const SYNTHETIC_CLUBS = 20;
const SYNTHETIC_GAMEWEEKS = 14;
const SYNTHETIC_NEXT_GAMEWEEK = 11;
const SYNTHETIC_POSITION_SHARE = [
  [1, 0.1],
  [2, 0.33],
  [3, 0.4],
  [4, 0.17],
] as const;

export type Random = () => number;

export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function between(random: Random, low: number, high: number): number {
  return low + random() * (high - low);
}

function syntheticPlayer(random: Random, id: number, position: number) {
  const quality = random() ** 2;
  const regular = random() < 0.7;
  const starts = regular
    ? Math.round(between(random, 6, 10))
    : Math.round(between(random, 0, 5));
  const attack = [0, 0.3, 1, 1.6][position - 1];
  return player(id, position, 1 + Math.floor(random() * SYNTHETIC_CLUBS), {
    web_name: `Synthetic ${id}`,
    now_cost: Math.round(40 + quality * [25, 35, 90, 100][position - 1]),
    minutes:
      starts * Math.round(between(random, 60, 90)) +
      Math.round(between(random, 0, 60)),
    starts,
    expected_goals: Number(
      (attack * quality * between(random, 2, 8)).toFixed(2),
    ),
    expected_assists: Number(
      (attack * quality * between(random, 1, 5)).toFixed(2),
    ),
    expected_goals_conceded: Number(between(random, 8, 16).toFixed(2)),
    defensive_contribution: Math.round(between(random, 10, 90)),
    saves: position === 1 ? Math.round(between(random, 10, 40)) : 0,
    creativity: Math.round(between(random, 0, 400)),
    chance_of_playing_next_round: random() < 0.05 ? 25 : 100,
    status: random() < 0.03 ? "i" : "a",
  });
}

function syntheticFixtures(
  random: Random,
  blankAndDouble: boolean,
): Data["fixtures"] {
  const fixtures: Data["fixtures"] = [];
  for (let week = 1; week <= SYNTHETIC_GAMEWEEKS; week++) {
    const clubs = Array.from(
      { length: SYNTHETIC_CLUBS },
      (_, index) => index + 1,
    );
    const rotation = clubs.map(
      (_, index) => clubs[(index + week) % SYNTHETIC_CLUBS],
    );
    for (let index = 0; index < SYNTHETIC_CLUBS / 2; index++) {
      const home = rotation[index];
      const away = rotation[SYNTHETIC_CLUBS - 1 - index];
      const blank =
        blankAndDouble && week === SYNTHETIC_NEXT_GAMEWEEK + 1 && index < 2;
      const double =
        blankAndDouble && week === SYNTHETIC_NEXT_GAMEWEEK + 2 && index < 3;
      for (let copy = 0; copy < (blank ? 0 : double ? 2 : 1); copy++)
        fixtures.push({
          id: fixtures.length + 1,
          event: week,
          team_h: home,
          team_a: away,
          team_h_difficulty: 1 + Math.floor(random() * 5),
          team_a_difficulty: 1 + Math.floor(random() * 5),
          finished: week < SYNTHETIC_NEXT_GAMEWEEK,
          kickoff_time: "2026-10-01T12:00:00Z",
        });
    }
  }
  return fixtures;
}

export function syntheticLeague(
  seed: number,
  { players = SYNTHETIC_LEAGUE_PLAYERS, blankAndDouble = false } = {},
): Data {
  const random = seededRandom(seed);
  const elements: Player[] = [];
  for (const [position, share] of SYNTHETIC_POSITION_SHARE)
    for (let index = 0; index < Math.round(players * share); index++)
      elements.push(syntheticPlayer(random, elements.length + 1, position));
  const data = seasonData();
  data.bootstrap.elements = elements;
  data.fixtures = syntheticFixtures(random, blankAndDouble);
  return data;
}

export function syntheticSquad(
  data: Data,
  random: Random,
  { budget = 1000 } = {},
): Settings {
  const clubs = new Map<number, number>();
  const picked: Player[] = [];
  const shuffled = [...data.bootstrap.elements];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  for (const position of SQUAD_SHAPE) {
    const remaining = SQUAD_SHAPE.length - picked.length - 1;
    const spent = picked.reduce((sum, chosen) => sum + chosen.now_cost, 0);
    const choice = shuffled.find(
      (candidate) =>
        candidate.element_type === position &&
        !picked.includes(candidate) &&
        (clubs.get(candidate.team) ?? 0) < 3 &&
        spent + candidate.now_cost + remaining * 40 <= budget,
    );
    if (!choice) throw new Error("Synthetic squad could not be completed.");
    clubs.set(choice.team, (clubs.get(choice.team) ?? 0) + 1);
    picked.push(choice);
  }
  const spent = picked.reduce((sum, chosen) => sum + chosen.now_cost, 0);
  return {
    ...settingsFor(data),
    bank: budget - spent,
    squad: picked.map((chosen) => ({
      id: chosen.id,
      sellingPrice: Math.max(0, chosen.now_cost - Math.floor(random() * 3)),
    })),
  };
}
