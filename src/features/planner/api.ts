import { z } from "zod";
import {
  dataSchema,
  picksSchema,
  historySchema,
  type Data,
} from "@/lib/schemas";
async function read<T>(
  url: string,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, { signal, cache: "no-store" });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(body);
    throw new Error(
      error.success
        ? error.data.error
        : "The request failed. Please try again.",
    );
  }
  return schema.parse(body);
}

export function loadPlannerData() {
  return read("/api/data", dataSchema);
}
export function loadTeamPicks(teamId: string) {
  return read(
    `/api/import?id=${encodeURIComponent(teamId)}`,
    picksSchema.extend({ fetchedAt: z.string() }),
  );
}

export async function loadPlayerHistories(data: Data, ids: number[]) {
  const histories = { ...data.histories };
  const pending = ids.filter((id) => histories[String(id)] === undefined);
  const signal = AbortSignal.timeout(8000);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, pending.length) }, async () => {
      while (cursor < pending.length && !signal.aborted) {
        const id = pending[cursor++];
        try {
          const response = await read(
            `/api/history/${id}`,
            historySchema,
            signal,
          );
          histories[String(id)] = response.history;
        } catch {
          // A partial history response must not prevent season-data fallback.
        }
      }
    }),
  );
  const loaded = ids.filter((id) => histories[String(id)]?.length).length;
  return {
    data: { ...data, histories },
    notice: `Recent history available for ${loaded} of ${ids.length} selected players. Others use season estimates. The history pool includes your squad, forecast leaders and budget options; it does not cover every player.`,
  };
}
