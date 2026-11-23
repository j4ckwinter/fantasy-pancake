import { describe, expect, it } from "vitest";
import type { Data, Settings } from "@/lib/schemas";
import { restoreSettings, saveSettings, settingsFromImport } from "./settings";

function seasonData(deadline = "2026-08-14T17:30:00Z"): Data {
  return {
    fetchedAt: "2026-10-31T18:00:00Z",
    fixtures: [],
    bootstrap: {
      elements: Array.from({ length: 15 }, (_, i) => ({
        id: i + 1,
        web_name: `Player ${i + 1}`,
        team: i + 1,
        element_type: 1,
        now_cost: 50 + i,
        status: "a",
        news: "",
        can_select: true,
        can_transact: true,
        chance_of_playing_next_round: null,
        minutes: 0,
        starts: 0,
        expected_goals: 0,
        expected_assists: 0,
        expected_goals_conceded: 0,
        defensive_contribution: 0,
        saves: 0,
        creativity: 0,
        penalties_order: null,
        corners_and_indirect_freekicks_order: null,
        direct_freekicks_order: null,
      })),
      teams: [],
      events: [
        {
          id: 1,
          name: "Gameweek 1",
          deadline_time: deadline,
          finished: false,
          is_current: false,
          is_next: true,
        },
      ],
      element_types: [],
      game_settings: {
        squad_squadsize: 15,
        squad_squadplay: 11,
        squad_team_limit: 3,
        max_extra_free_transfers: 4,
      },
    },
  };
}

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

function memoryStorage(saved: string | null = null) {
  let value = saved;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
  };
}

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
});
