import { afterEach, describe, expect, it, vi } from "vitest";
import { FplError, createFplClient, getHistory, importTeam } from "./fpl";
afterEach(() => vi.unstubAllGlobals());
describe("FPL boundary", () => {
  it("imports the latest published squad, skipping only 404s", async () => {
    const picks = {
      active_chip: null,
      entry_history: { event: 8, bank: 7 },
      picks: Array.from({ length: 15 }, (_, i) => ({ element: i + 1 })),
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          name: "The Pancake XI",
          current_event: 9,
          started_event: 8,
        }),
      )
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(Response.json(picks));
    vi.stubGlobal("fetch", fetcher);
    const result = await importTeam(3333);
    expect(result.teamName).toBe("The Pancake XI");
    expect(result.entry_history.event).toBe(8);
    expect(result.entry_history.bank).toBe(7);
    expect(fetcher.mock.calls[2][0]).toContain("/event/8/picks/");
    fetcher.mockResolvedValueOnce(new Response("", { status: 404 }));
    expect((await importTeam(3333)).entry_history.event).toBe(8);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("does not hide outages by falling back to older picks", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ current_event: 9, started_event: 1 }),
      )
      .mockResolvedValueOnce(new Response("", { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(importTeam(4444)).rejects.toBeInstanceOf(FplError);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("rejects malformed upstream responses rather than caching them", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ history: "broken" }))
      .mockResolvedValueOnce(Response.json({ history: [] }));
    vi.stubGlobal("fetch", fetcher);
    await expect(getHistory(9999)).rejects.toThrow();
    expect((await getHistory(9999)).history).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("coalesces simultaneous requests and preserves the fetch timestamp", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ history: [] }));
    vi.stubGlobal("fetch", fetcher);
    const [a, b] = await Promise.all([getHistory(8888), getHistory(8888)]);
    expect(a).toEqual(b);
    expect(await getHistory(8888)).toEqual(a);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("reports a missing player history as a missing player, not a missing team", async () => {
    const client = createFplClient({
      fetch: async () => new Response("", { status: 404 }),
      now: () => 0,
    });
    await expect(client.getHistory(5)).rejects.toMatchObject({
      status: 404,
      message: "No FPL history was found for that player.",
    });
  });
});
