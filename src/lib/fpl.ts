import { z } from "zod";
import {
  bootstrapSchema,
  fixtureSchema,
  historySchema,
  picksSchema,
} from "./schemas";

const ROOT = "https://fantasy.premierleague.com/api/";
const TTL = 300_000;
const cache = new Map<
  string,
  { expires: number; value: unknown; fetchedAt: string }
>();
const pending = new Map<
  string,
  Promise<{ value: unknown; fetchedAt: string }>
>();
export class FplError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}
async function request<T>(
  path: string,
  schema: z.ZodType<T>,
): Promise<{ value: T; fetchedAt: string }> {
  const cached = cache.get(path);
  if (cached && cached.expires > Date.now())
    return { value: schema.parse(cached.value), fetchedAt: cached.fetchedAt };
  let promise = pending.get(path);
  if (!promise) {
    promise = (async () => {
      const response = await fetch(ROOT + path, {
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
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
      const fetchedAt = new Date().toISOString();
      if (cache.size >= 200) cache.delete(cache.keys().next().value!);
      cache.set(path, { value, fetchedAt, expires: Date.now() + TTL });
      return { value, fetchedAt };
    })();
    pending.set(path, promise);
  }
  try {
    const result = await promise;
    return { value: schema.parse(result.value), fetchedAt: result.fetchedAt };
  } finally {
    pending.delete(path);
  }
}
export async function getData() {
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
export async function importTeam(id: number) {
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
export async function getHistory(id: number) {
  const result = await request(`element-summary/${id}/`, historySchema);
  return { ...result.value, fetchedAt: result.fetchedAt };
}
export function errorResponse(error: unknown) {
  if (error instanceof FplError)
    return Response.json({ error: error.message }, { status: error.status });
  console.error(
    "FPL request failed",
    error instanceof Error ? error.message : "Unknown error",
  );
  return Response.json(
    { error: "Could not load valid FPL data. Please try again shortly." },
    { status: 502 },
  );
}
export const idSchema = z.coerce.number().int().min(1).max(100_000_000);
