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
});
