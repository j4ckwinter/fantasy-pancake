import { test as base, expect, type Page } from "@playwright/test";
import type { Data, Player } from "../../../src/lib/schemas";

export { expect } from "@playwright/test";

export const FETCHED_AT = "2026-10-31T18:00:00Z";
export const START_TIME = new Date(FETCHED_AT);
export const NEW_STAR_INDEX = 15;
const SQUAD_SIZE = 15;

export const newDefender = {
  id: 17,
  web_name: "New Defender",
  element_type: 2,
  expected_goals: 10,
};

export function fixtureData(): Data {
  const elements: Player[] = [
    1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 3,
  ].map((position, i) => ({
    id: i + 1,
    web_name: i === NEW_STAR_INDEX ? "New Star" : `Player ${i + 1}`,
    team: Math.floor(i / 3) + 1,
    element_type: position,
    now_cost: 50,
    status: "a",
    news: "",
    can_select: true,
    can_transact: true,
    chance_of_playing_next_round: null,
    minutes: 720,
    starts: 8,
    expected_goals: i === NEW_STAR_INDEX ? 12 : 1,
    expected_assists: 1,
    expected_goals_conceded: 10,
    defensive_contribution: 40,
    saves: 10,
    creativity: 10,
    penalties_order: null,
    corners_and_indirect_freekicks_order: null,
    direct_freekicks_order: null,
  }));
  return {
    fetchedAt: FETCHED_AT,
    bootstrap: {
      elements,
      teams: Array.from({ length: 20 }, (_, i) => ({
        id: i + 1,
        name: `Team ${i + 1}`,
        short_name: `T${i + 1}`,
      })),
      events: Array.from({ length: 12 }, (_, i) => ({
        id: i + 1,
        name: `Gameweek ${i + 1}`,
        deadline_time: "2026-10-31T12:00:00Z",
        finished: i < 8,
        is_current: i === 7,
        is_next: i === 8,
      })),
      element_types: [
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
      ],
      game_settings: {
        squad_squadsize: 15,
        squad_squadplay: 11,
        squad_team_limit: 3,
        max_extra_free_transfers: 4,
      },
    },
    fixtures: Array.from({ length: 12 }, (_, w) =>
      Array.from({ length: 6 }, (_, i) => ({
        id: w * 6 + i,
        event: w + 1,
        team_h: i + 1,
        team_a: i + 11,
        team_h_difficulty: 3,
        team_a_difficulty: 3,
        finished: w < 8,
        kickoff_time: "2026-10-31T12:00:00Z",
      })),
    ).flat(),
  };
}

const CHIP_WINDOWS = [
  ["wildcard", 2, 19],
  ["freehit", 2, 19],
  ["bboost", 1, 19],
  ["3xc", 1, 19],
  ["wildcard", 20, 38],
  ["freehit", 20, 38],
  ["bboost", 20, 38],
  ["3xc", 20, 38],
] as const;

export function withChipRules(
  data: Data,
  windows: readonly (readonly [string, number, number])[] = CHIP_WINDOWS,
): Data {
  data.bootstrap.chips = windows.map(([name, start, stop], index) => ({
    id: index + 1,
    name,
    number: 1,
    start_event: start,
    stop_event: stop,
    chip_type: name === "bboost" || name === "3xc" ? "team" : "transfer",
  }));
  return data;
}

export function withDoubleGameweek(data: Data, week: number): Data {
  const first = Math.max(...data.fixtures.map((fixture) => fixture.id)) + 1;
  data.fixtures.push(
    ...Array.from({ length: 6 }, (_, i) => ({
      id: first + i,
      event: week,
      team_h: i + 11,
      team_a: i + 1,
      team_h_difficulty: 3,
      team_a_difficulty: 3,
      finished: false,
      kickoff_time: "2026-10-31T12:00:00Z",
    })),
  );
  return data;
}

export function withPlayer(
  data: Data,
  copyOf: number,
  player: Partial<Player> & Pick<Player, "id" | "web_name">,
): Data {
  data.bootstrap.elements.push({
    ...data.bootstrap.elements[copyOf],
    ...player,
  });
  return data;
}

export function squadPicks(replacements: Record<number, number> = {}) {
  return Array.from({ length: SQUAD_SIZE }, (_, i) => ({
    element: replacements[i] ?? i + 1,
  }));
}

export function importResponse(overrides: Record<string, unknown> = {}) {
  return {
    active_chip: null,
    entry_history: { event: 8, bank: 5 },
    picks: squadPicks(),
    fetchedAt: FETCHED_AT,
    ...overrides,
  };
}

export async function routeData(page: Page, data: Data) {
  await page.route("**/api/data", (route) => route.fulfill({ json: data }));
}

export async function routeImport(page: Page, body: object, status = 200) {
  await page.route("**/api/import?*", (route) =>
    route.fulfill({ status, json: body }),
  );
}

export async function failHistory(page: Page) {
  await page.route("**/api/history/*", (route) =>
    route.fulfill({ status: 503, json: { error: "Unavailable" } }),
  );
}

async function failUnstubbedApiRequests(page: Page) {
  const unstubbed: string[] = [];
  await page.route("**/api/**", (route) => {
    unstubbed.push(route.request().url());
    return route.abort();
  });
  return unstubbed;
}

async function installDefaultRoutes(page: Page) {
  await page.route("**/api/history/*", (route) =>
    route.fulfill({ json: { history: [] } }),
  );
  await routeData(page, fixtureData());
  await routeImport(page, importResponse());
}

const WEBKIT_CANCELLED_PREFETCH = /\?_rsc=\S+ due to access control checks\.$/;

export const test = base.extend({
  page: async ({ page }, provide) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => {
      if (!WEBKIT_CANCELLED_PREFETCH.test(error.message))
        pageErrors.push(error.message);
    });
    await page.clock.setFixedTime(START_TIME);
    const unstubbed = await failUnstubbedApiRequests(page);
    await installDefaultRoutes(page);
    await provide(page);
    expect(unstubbed, "API requests without a test route").toEqual([]);
    expect(pageErrors, "uncaught page errors").toEqual([]);
  },
});
