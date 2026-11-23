import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { createFplClient } from "./fpl";

const TTL = 300_000;

function fakeClient(...responses: Response[]) {
  const clock = { now: 0 };
  const fetcher = vi.fn<typeof fetch>();
  for (const response of responses) fetcher.mockResolvedValueOnce(response);
  const client = createFplClient({ fetch: fetcher, now: () => clock.now });
  return { client, fetcher, clock };
}

function emptyHistory() {
  return Response.json({ history: [] });
}

describe("FPL boundary", () => {
  it("imports the latest published squad, skipping only 404s", async () => {
    const picks = {
      active_chip: null,
      entry_history: { event: 8, bank: 7 },
      picks: Array.from({ length: 15 }, (_, i) => ({ element: i + 1 })),
    };
    const { client, fetcher } = fakeClient(
      Response.json({
        name: "The Pancake XI",
        current_event: 9,
        started_event: 8,
      }),
      new Response("", { status: 404 }),
      Response.json(picks),
    );
    const result = await client.importTeam(3333);
    expect(result.teamName).toBe("The Pancake XI");
    expect(result.entry_history.event).toBe(8);
    expect(result.entry_history.bank).toBe(7);
    expect(fetcher.mock.calls[2][0]).toContain("/event/8/picks/");
    fetcher.mockResolvedValueOnce(new Response("", { status: 404 }));
    expect((await client.importTeam(3333)).entry_history.event).toBe(8);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("does not hide outages by falling back to older picks", async () => {
    const { client, fetcher } = fakeClient(
      Response.json({ current_event: 9, started_event: 1 }),
      new Response("", { status: 503 }),
    );
    await expect(client.importTeam(4444)).rejects.toMatchObject({
      status: 502,
      message: "FPL is temporarily unavailable. Please try again shortly.",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed upstream responses rather than caching them", async () => {
    const { client, fetcher } = fakeClient(
      Response.json({ history: "broken" }),
      emptyHistory(),
    );
    const failure = client.getHistory(9999);
    await expect(failure).rejects.toBeInstanceOf(ZodError);
    await expect(failure).rejects.toThrow("history");
    expect((await client.getHistory(9999)).history).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("coalesces simultaneous requests and stamps them with the injected clock", async () => {
    const { client, fetcher, clock } = fakeClient(emptyHistory());
    clock.now = Date.parse("2026-10-01T12:00:00Z");
    const [a, b] = await Promise.all([
      client.getHistory(8888),
      client.getHistory(8888),
    ]);
    expect(a).toEqual(b);
    expect(a.fetchedAt).toBe("2026-10-01T12:00:00.000Z");
    expect(await client.getHistory(8888)).toEqual(a);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("serves cached responses until they expire, then fetches again", async () => {
    const { client, fetcher, clock } = fakeClient(
      emptyHistory(),
      emptyHistory(),
    );
    await client.getHistory(1);
    clock.now = TTL - 1;
    await client.getHistory(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    clock.now = TTL;
    expect((await client.getHistory(1)).fetchedAt).toBe(
      new Date(TTL).toISOString(),
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("evicts the oldest response once 200 are cached", async () => {
    const { client, fetcher } = fakeClient();
    fetcher.mockImplementation(async () => emptyHistory());
    for (let id = 1; id <= 201; id++) await client.getHistory(id);
    fetcher.mockClear();
    await client.getHistory(2);
    expect(fetcher).not.toHaveBeenCalled();
    await client.getHistory(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("reports a missing player history as a missing player, not a missing team", async () => {
    const { client } = fakeClient(new Response("", { status: 404 }));
    await expect(client.getHistory(5)).rejects.toMatchObject({
      status: 404,
      message: "No FPL history was found for that player.",
    });
  });

  it("keeps a fresh entry when refreshing an expired one at capacity", async () => {
    const { client, fetcher, clock } = fakeClient();
    fetcher.mockImplementation(async () => emptyHistory());
    await client.getHistory(1);
    await client.getHistory(2);
    clock.now = TTL + 1;
    await client.getHistory(1);
    for (let id = 3; id <= 200; id++) await client.getHistory(id);
    clock.now = TTL + 2;
    await client.getHistory(2);
    fetcher.mockClear();
    await client.getHistory(1);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
