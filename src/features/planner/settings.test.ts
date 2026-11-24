import { describe, expect, it } from "vitest";
import type { Settings } from "@/lib/schemas";
import { memoryStorage, seasonData } from "./test-fixtures";
import { restoreSettings, saveSettings, settingsFromImport } from "./settings";

const savedVersion1: Settings = {
  version: 1,
  entryId: 123,
  teamName: "Pancake XI",
  sourceGameweek: 8,
  season: "2026",
  bank: 5,
  freeTransfers: 2,
  lockedPlayerIds: [3],
  availabilityScenario: "recover-next-week",
  squad: Array.from({ length: 15 }, (_, i) => ({
    id: i + 1,
    sellingPrice: 40,
  })),
};

describe("saved settings", () => {
  it("restores version-1 settings with selling prices reset to market", () => {
    const restored = restoreSettings(
      memoryStorage(JSON.stringify(savedVersion1)),
      seasonData(),
    );
    expect(restored).toEqual({
      status: "restored",
      settings: {
        ...savedVersion1,
        squad: savedVersion1.squad.map((pick) => ({
          id: pick.id,
          sellingPrice: 50 + pick.id - 1,
        })),
      },
    });
  });

  it("reports nothing saved for empty storage", () => {
    expect(restoreSettings(memoryStorage(), seasonData())).toEqual({
      status: "empty",
    });
  });

  it("treats settings from another season as invalid", () => {
    const storage = memoryStorage(JSON.stringify(savedVersion1));
    expect(
      restoreSettings(storage, seasonData("2027-08-13T17:30:00Z")),
    ).toEqual({ status: "invalid" });
  });

  it("treats unreadable saved text as invalid settings", () => {
    expect(restoreSettings(memoryStorage("{not json"), seasonData())).toEqual({
      status: "invalid",
    });
  });

  it("round-trips settings through storage", () => {
    const storage = memoryStorage();
    saveSettings(storage, savedVersion1);
    expect(restoreSettings(storage, seasonData()).status).toBe("restored");
  });

  it("imports with one free transfer, the deadline bank and market prices", () => {
    expect(
      settingsFromImport(seasonData(), 123, {
        teamName: "Pancake XI",
        active_chip: null,
        entry_history: { event: 8, bank: 5 },
        picks: Array.from({ length: 15 }, (_, i) => ({ element: i + 1 })),
      }),
    ).toEqual({
      version: 1,
      entryId: 123,
      teamName: "Pancake XI",
      sourceGameweek: 8,
      season: "2026",
      bank: 5,
      freeTransfers: 1,
      squad: Array.from({ length: 15 }, (_, i) => ({
        id: i + 1,
        sellingPrice: 50 + i,
      })),
    });
  });

  it("keeps the chips played at import and skips chips it does not know", () => {
    const settings = settingsFromImport(seasonData(), 123, {
      active_chip: null,
      entry_history: { event: 8, bank: 5 },
      picks: Array.from({ length: 15 }, (_, i) => ({ element: i + 1 })),
      chipsPlayed: [
        { name: "bboost", event: 2 },
        { name: "manager", event: 4 },
        { name: "3xc", event: 6 },
      ],
    });
    expect(settings.chipsPlayed).toEqual([
      { name: "bboost", event: 2 },
      { name: "3xc", event: 6 },
    ]);
  });

  it("restores version-1 settings saved before chips were recorded, and with them", () => {
    const withChips = {
      ...savedVersion1,
      chipsPlayed: [{ name: "wildcard", event: 3 }],
    };
    const restore = (saved: object) =>
      restoreSettings(memoryStorage(JSON.stringify(saved)), seasonData());
    expect(restore(savedVersion1)).toMatchObject({ status: "restored" });
    expect(JSON.stringify(restore(savedVersion1))).not.toContain("chips");
    expect(restore(withChips)).toMatchObject({
      status: "restored",
      settings: { chipsPlayed: [{ name: "wildcard", event: 3 }] },
    });
  });
});
