import { afterEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "@/lib/schemas";
import { restoreSavedTeam } from "./restore-session";
import type { SessionAction } from "./session";
import { seasonData } from "./test-fixtures";

const unnamed: Settings = {
  version: 1,
  entryId: 123,
  sourceGameweek: 8,
  season: "2026",
  bank: 5,
  freeTransfers: 1,
  squad: Array.from({ length: 15 }, (_, i) => ({
    id: i + 1,
    sellingPrice: 50,
  })),
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("restoring a saved team", () => {
  it("warns when the restored team cannot be saved again", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          teamName: "Pancake XI",
          active_chip: null,
          entry_history: { event: 8, bank: 5 },
          picks: Array.from({ length: 15 }, (_, i) => ({ element: i + 1 })),
          fetchedAt: "2026-10-31T18:00:00Z",
        }),
      ),
    );
    const actions: SessionAction[] = [];
    await restoreSavedTeam(seasonData(), {
      storage: {
        getItem: () => JSON.stringify(unnamed),
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      },
      isActive: () => true,
      dispatch: (action) => actions.push(action),
      showBusy: () => {},
      enriched: () => {},
    });
    expect(actions).toContainEqual({
      type: "noticed",
      notice: "settings-not-saved",
    });
  });

  async function restoreWith(
    saved: Settings,
    fetcher: () => Promise<Response>,
  ) {
    vi.stubGlobal("fetch", vi.fn(fetcher));
    const actions: SessionAction[] = [];
    const writes: string[] = [];
    await restoreSavedTeam(seasonData(), {
      storage: {
        getItem: () => JSON.stringify(saved),
        setItem: (_key, value) => {
          writes.push(value);
        },
      },
      isActive: () => true,
      dispatch: (action) => actions.push(action),
      showBusy: () => {},
      enriched: () => {},
    });
    return {
      restored: actions.find((action) => action.type === "restored"),
      writes,
    };
  }

  it("refreshes the chips a saved team has played since it was saved", async () => {
    const saved = { ...unnamed, teamName: "Pancake XI", chipsPlayed: [] };
    const { restored, writes } = await restoreWith(saved, async () =>
      Response.json({
        teamName: "Pancake XI",
        active_chip: null,
        entry_history: { event: 9, bank: 9 },
        picks: Array.from({ length: 15 }, (_, i) => ({ element: i + 20 })),
        chipsPlayed: [{ name: "3xc", event: 9 }],
        fetchedAt: "2026-10-31T18:00:00Z",
      }),
    );
    expect(restored).toMatchObject({
      type: "restored",
      chipsFromSave: false,
      settings: {
        chipsPlayed: [{ name: "3xc", event: 9 }],
        bank: unnamed.bank,
      },
    });
    expect(
      restored?.type === "restored" &&
        restored.settings.squad.map((pick) => pick.id),
    ).toEqual(unnamed.squad.map((pick) => pick.id));
    expect(JSON.parse(writes[0]).chipsPlayed).toEqual([
      { name: "3xc", event: 9 },
    ]);
  });

  it("keeps the saved chips and says so when FPL cannot be reached", async () => {
    const saved = {
      ...unnamed,
      teamName: "Pancake XI",
      chipsPlayed: [{ name: "wildcard" as const, event: 3 }],
    };
    const { restored } = await restoreWith(
      saved,
      async () => new Response("", { status: 503 }),
    );
    expect(restored).toMatchObject({
      type: "restored",
      chipsFromSave: true,
      settings: { chipsPlayed: [{ name: "wildcard", event: 3 }] },
    });
  });
});
