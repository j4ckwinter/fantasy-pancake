import { z } from "zod";
import {
  settingsSchema,
  picksSchema,
  type Data,
  type Settings,
} from "@/lib/schemas";

export const STORAGE_KEY = "fpl-planner-v1";
export type SettingsStorage = Pick<Storage, "getItem" | "setItem">;
type RestoredSettings =
  | { status: "empty" }
  | { status: "invalid" }
  | { status: "restored"; settings: Settings };

export function marketPricePick(
  data: Data,
  id: number,
): Settings["squad"][number] {
  return {
    id,
    sellingPrice:
      data.bootstrap.elements.find((player) => player.id === id)?.now_cost ?? 0,
  };
}

export function refreshEstimatedPrices(
  data: Data,
  settings: Settings,
  confirmed: number[],
): Settings {
  return {
    ...settings,
    squad: settings.squad.map((pick) =>
      confirmed.includes(pick.id) ? pick : marketPricePick(data, pick.id),
    ),
  };
}

export function settingsFromImport(
  data: Data,
  entryId: number,
  imported: z.infer<typeof picksSchema>,
): Settings {
  return {
    version: 1,
    entryId,
    teamName: imported.teamName,
    sourceGameweek: imported.entry_history.event,
    season: data.bootstrap.events[0].deadline_time.slice(0, 4),
    bank: imported.entry_history.bank,
    freeTransfers: 1,
    squad: imported.picks.map((pick) => marketPricePick(data, pick.element)),
  };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function restoreSettings(
  storage: SettingsStorage,
  data: Data,
): RestoredSettings {
  const saved = storage.getItem(STORAGE_KEY);
  if (!saved) return { status: "empty" };
  const parsed = settingsSchema.safeParse(parseJson(saved));
  if (
    !parsed.success ||
    parsed.data.season !== data.bootstrap.events[0]?.deadline_time.slice(0, 4)
  ) {
    return { status: "invalid" };
  }
  return {
    status: "restored",
    settings: {
      ...parsed.data,
      squad: parsed.data.squad.map((pick) => marketPricePick(data, pick.id)),
    },
  };
}

export function saveSettings(storage: SettingsStorage, settings: Settings) {
  storage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
