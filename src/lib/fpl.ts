import { z } from "zod";
import {
  bootstrapSchema,
  entryHistorySchema,
  fixtureSchema,
  historySchema,
  picksSchema,
} from "./schemas";

const ROOT = "https://fantasy.premierleague.com/api/";
const TTL = 300_000;
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_CACHED_RESPONSES = 200;
const TEAM_NOT_FOUND =
  "No published FPL data was found for that team or gameweek.";
const PLAYER_HISTORY_NOT_FOUND = "No FPL history was found for that player.";

export class FplError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

type Fetched<T> = { value: T; fetchedAt: string };
type CacheEntry = Fetched<unknown> & { expires: number };

export type FplClientOptions = {
  fetch: typeof fetch;
  now: () => number;
};

export function createFplClient({ fetch, now }: FplClientOptions) {
  const cache = new Map<string, CacheEntry>();
  const pending = new Map<string, Promise<Fetched<unknown>>>();

  async function load<T>(
    path: string,
    schema: z.ZodType<T>,
    notFoundMessage: string,
  ): Promise<Fetched<T>> {
    const response = await fetch(ROOT + path, {
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    if (!response.ok)
      throw new FplError(
        response.status === 404
          ? notFoundMessage
          : "FPL is temporarily unavailable. Please try again shortly.",
        response.status === 404 ? 404 : 502,
      );
    const value = schema.parse(await response.json());
    const fetchedAt = new Date(now()).toISOString();
    cache.delete(path);
    if (cache.size >= MAX_CACHED_RESPONSES)
      cache.delete(cache.keys().next().value!);
    cache.set(path, { value, fetchedAt, expires: now() + TTL });
    return { value, fetchedAt };
  }

  async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    notFoundMessage: string,
  ): Promise<Fetched<T>> {
    const cached = cache.get(path);
    if (cached && cached.expires > now())
      return { value: cached.value as T, fetchedAt: cached.fetchedAt };
    let promise = pending.get(path);
    if (!promise) {
      promise = load(path, schema, notFoundMessage);
      pending.set(path, promise);
    }
    try {
      return (await promise) as Fetched<T>;
    } finally {
      pending.delete(path);
    }
  }

  async function getData() {
    const [bootstrap, fixtures] = await Promise.all([
      request("bootstrap-static/", bootstrapSchema, TEAM_NOT_FOUND),
      request("fixtures/", z.array(fixtureSchema), TEAM_NOT_FOUND),
    ]);
    return {
      bootstrap: bootstrap.value,
      fixtures: fixtures.value,
      fetchedAt: [bootstrap.fetchedAt, fixtures.fetchedAt].sort()[0],
    };
  }

  async function importTeam(id: number) {
    const entry = await request(
      `entry/${id}/`,
      z.object({
        name: z.string().trim().optional(),
        current_event: z.number().int().nullable(),
        started_event: z.number().int(),
      }),
      TEAM_NOT_FOUND,
    );
    const latest = entry.value.current_event;
    if (!latest)
      throw new FplError("This team has no published gameweek squad yet.", 404);
    for (
      let gameweek = latest;
      gameweek >= entry.value.started_event;
      gameweek--
    ) {
      try {
        const picks = await request(
          `entry/${id}/event/${gameweek}/picks/`,
          picksSchema,
          TEAM_NOT_FOUND,
        );
        return {
          ...picks.value,
          teamName: entry.value.name || undefined,
          chipsPlayed: await chipsPlayed(id),
          fetchedAt: picks.fetchedAt,
        };
      } catch (error) {
        if (!(error instanceof FplError) || error.status !== 404) throw error;
      }
    }
    throw new FplError("This team has no published gameweek squad yet.", 404);
  }

  async function chipsPlayed(id: number) {
    try {
      const history = await request(
        `entry/${id}/history/`,
        entryHistorySchema,
        TEAM_NOT_FOUND,
      );
      return history.value.chips;
    } catch {
      return undefined;
    }
  }

  async function getHistory(id: number) {
    const result = await request(
      `element-summary/${id}/`,
      historySchema,
      PLAYER_HISTORY_NOT_FOUND,
    );
    return { ...result.value, fetchedAt: result.fetchedAt };
  }

  return { getData, importTeam, getHistory };
}

const defaultClient = createFplClient({
  fetch: (input, init) => fetch(input, init),
  now: () => Date.now(),
});

export const { getData, importTeam, getHistory } = defaultClient;
