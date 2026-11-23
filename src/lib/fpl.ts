import { z } from "zod";
import {
  bootstrapSchema,
  fixtureSchema,
  historySchema,
  picksSchema,
} from "./schemas";

const ROOT = "https://fantasy.premierleague.com/api/";
const TTL = 300_000;
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_CACHED_RESPONSES = 200;

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
  ): Promise<Fetched<T>> {
    const response = await fetch(ROOT + path, {
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    if (!response.ok)
      throw new FplError(
        response.status === 404
          ? "No published FPL data was found for that team or gameweek."
          : "FPL is temporarily unavailable. Please try again shortly.",
        response.status === 404 ? 404 : 502,
      );
    const value = schema.parse(await response.json());
    const fetchedAt = new Date(now()).toISOString();
    if (cache.size >= MAX_CACHED_RESPONSES)
      cache.delete(cache.keys().next().value!);
    cache.set(path, { value, fetchedAt, expires: now() + TTL });
    return { value, fetchedAt };
  }

  async function request<T>(
    path: string,
    schema: z.ZodType<T>,
  ): Promise<Fetched<T>> {
    const cached = cache.get(path);
    if (cached && cached.expires > now())
      return { value: cached.value as T, fetchedAt: cached.fetchedAt };
    let promise = pending.get(path);
    if (!promise) {
      promise = load(path, schema);
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
      request("bootstrap-static/", bootstrapSchema),
      request("fixtures/", z.array(fixtureSchema)),
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
        );
        return {
          ...picks.value,
          teamName: entry.value.name || undefined,
          fetchedAt: picks.fetchedAt,
        };
      } catch (error) {
        if (!(error instanceof FplError) || error.status !== 404) throw error;
      }
    }
    throw new FplError("This team has no published gameweek squad yet.", 404);
  }

  async function getHistory(id: number) {
    const result = await request(`element-summary/${id}/`, historySchema);
    return { ...result.value, fetchedAt: result.fetchedAt };
  }

  return { getData, importTeam, getHistory };
}

const defaultClient = createFplClient({
  fetch: (input, init) => fetch(input, init),
  now: () => Date.now(),
});

export const { getData, importTeam, getHistory } = defaultClient;
