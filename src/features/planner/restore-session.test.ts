import { describe, expect, it } from "vitest";
import type { Analysis } from "@/lib/model";
import type { ImportedTeam, Settings } from "@/lib/schemas";
import { restoreSavedTeam } from "./restore-session";
import type { SessionAction } from "./session";
import { seasonData } from "./test-fixtures";

const saved: Settings = {
  version: 1,
  entryId: 123,
  teamName: "Pancake XI",
  sourceGameweek: 8,
  season: "2026",
  bank: 5,
  freeTransfers: 1,
  chipsPlayed: [{ name: "wildcard", event: 3 }],
  squad: Array.from({ length: 15 }, (_, i) => ({
    id: i + 1,
    sellingPrice: 50,
  })),
};

function imported(overrides: Partial<ImportedTeam> = {}): ImportedTeam {
  return {
    teamName: "Pancake XI",
    active_chip: null,
    entry_history: { event: 9, bank: 9 },
    picks: Array.from({ length: 15 }, (_, i) => ({ element: i + 20 })),
    chipsPlayed: [
      { name: "wildcard", event: 3 },
      { name: "3xc", event: 9 },
    ],
    fetchedAt: "2026-10-31T18:00:00Z",
    ...overrides,
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

async function restore(
  loadTeam: () => Promise<ImportedTeam>,
  setItem: (key: string, value: string) => void = () => {},
  getItem: () => string = () => JSON.stringify(saved),
) {
  const actions: SessionAction[] = [];
  const compared = deferred<void>();
  const done = restoreSavedTeam(seasonData(), {
    storage: { getItem, setItem },
    isActive: () => true,
    dispatch: (action) => {
      actions.push(action);
      if (action.type === "restore-compared") compared.resolve();
    },
    showBusy: () => {},
    enriched: () => {},
    loadTeam,
    compare: async (data) => ({
      data,
      result: { weeks: [] } as unknown as Analysis,
    }),
  });
  return { actions, done, compared: compared.promise };
}

const types = (actions: SessionAction[]) =>
  actions.map((action) => action.type);

describe("restoring a saved team", () => {
  it("shows the saved plan before FPL answers, then applies the chips played since", async () => {
    const answer = deferred<ImportedTeam>();
    const { actions, done, compared } = await restore(() => answer.promise);
    await compared;
    expect(types(actions)).toEqual(["restored", "restore-compared"]);
    expect(actions[0]).toMatchObject({ chipsStatus: "checking" });
    answer.resolve(imported());
    await done;
    expect(actions[2]).toMatchObject({
      type: "chips-checked",
      chipsStatus: "current",
      from: { chipsPlayed: saved.chipsPlayed },
      settings: {
        bank: saved.bank,
        chipsPlayed: [
          { name: "wildcard", event: 3 },
          { name: "3xc", event: 9 },
        ],
      },
    });
  });

  it("keeps the saved chips and says FPL couldn't be reached", async () => {
    const { actions, done } = await restore(async () => {
      throw new Error("offline");
    });
    await done;
    expect(actions.at(-1)).toMatchObject({
      type: "chips-checked",
      chipsStatus: "unreachable",
      settings: { chipsPlayed: saved.chipsPlayed },
    });
  });

  it("says when FPL answered without the chip history", async () => {
    const { actions, done } = await restore(async () =>
      imported({ chipsPlayed: undefined }),
    );
    await done;
    expect(actions.at(-1)).toMatchObject({
      type: "chips-checked",
      chipsStatus: "no-history",
    });
  });

  it("warns when the refreshed chips cannot be saved", async () => {
    const { actions, done } = await restore(
      async () => imported(),
      () => {
        throw new Error("QuotaExceededError");
      },
    );
    await done;
    expect(actions).toContainEqual({
      type: "noticed",
      notice: "settings-not-saved",
    });
  });

  it("does not overwrite settings saved while FPL was answering", async () => {
    const writes: string[] = [];
    const stored = [JSON.stringify(saved)];
    const answer = deferred<ImportedTeam>();
    const { done, compared } = await restore(
      () => answer.promise,
      (_key, value) => {
        writes.push(value);
      },
      () => stored.at(-1)!,
    );
    await compared;
    stored.push(JSON.stringify({ ...saved, bank: 99 }));
    answer.resolve(imported());
    await done;
    expect(writes).toEqual([]);
  });
});
