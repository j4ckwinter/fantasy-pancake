import { z } from "zod";
import {
  dataSchema,
  picksSchema,
  historySchema,
  type Data,
} from "@/lib/schemas";
import { requestFailed, unexpectedResponse } from "./messages";
const errorBody = z.object({ error: z.string() });

async function read<T>(
  url: string,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, { signal, cache: "no-store" });
  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = errorBody.safeParse(body);
    throw new Error(error.success ? error.data.error : requestFailed);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new Error(unexpectedResponse);
  return parsed.data;
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
  return { data: { ...data, histories } };
}
