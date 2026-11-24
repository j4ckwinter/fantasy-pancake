import type { Dispatch } from "react";
import type { Analysis } from "@/lib/model";
import type { Data, ImportedTeam, Settings } from "@/lib/schemas";
import { errorMessage } from "@/lib/error-message";
import {
  STORAGE_KEY,
  knownChips,
  restoreSettings,
  saveSettings,
  type SettingsStorage,
} from "./settings";
import { checkTeamSettings, comparingPlans, restoringTeam } from "./messages";
import type { ChipsStatus, SessionAction } from "./session";

type CheckedChips = {
  settings: Settings;
  chipsStatus: Exclude<ChipsStatus, "checking">;
};

async function checkChips(
  settings: Settings,
  loadTeam: (entryId: string) => Promise<ImportedTeam>,
): Promise<CheckedChips> {
  try {
    const imported = await loadTeam(String(settings.entryId));
    const chipsPlayed =
      imported.chipsPlayed && knownChips(imported.chipsPlayed);
    return {
      settings: {
        ...settings,
        teamName: settings.teamName || imported.teamName,
        chipsPlayed: chipsPlayed ?? settings.chipsPlayed,
      },
      chipsStatus: chipsPlayed ? "current" : "no-history",
    };
  } catch {
    return { settings, chipsStatus: "unreachable" };
  }
}

export async function restoreSavedTeam(
  loaded: Data,
  {
    storage,
    isActive,
    dispatch,
    showBusy,
    enriched,
    loadTeam,
    compare,
  }: {
    storage: SettingsStorage;
    isActive: () => boolean;
    dispatch: Dispatch<SessionAction>;
    showBusy: (message: string) => void;
    enriched: (data: Data) => void;
    loadTeam: (entryId: string) => Promise<ImportedTeam>;
    compare: (
      data: Data,
      settings: Settings,
    ) => Promise<{ data: Data; result: Analysis }>;
  },
) {
  const savedText = storage.getItem(STORAGE_KEY);
  const restored = restoreSettings(storage, loaded);
  if (restored.status === "invalid") {
    dispatch({ type: "noticed", notice: "settings-invalid" });
    return;
  }
  if (restored.status !== "restored") return;
  const saved = restored.settings;
  showBusy(restoringTeam);
  dispatch({ type: "restored", settings: saved, chipsStatus: "checking" });
  const checking = checkChips(saved, loadTeam);
  showBusy(comparingPlans);
  let compared: Data | null = null;
  try {
    const comparison = await compare(loaded, saved);
    if (!isActive()) return;
    enriched(comparison.data);
    compared = comparison.data;
    dispatch({ type: "restore-compared", result: comparison.result });
  } catch (reason) {
    if (isActive())
      dispatch({
        type: "failed",
        error: errorMessage(reason, checkTeamSettings),
      });
  } finally {
    if (isActive()) showBusy("");
  }
  const checked = await checking;
  if (!isActive()) return;
  const changed = JSON.stringify(checked.settings) !== JSON.stringify(saved);
  const result =
    changed && compared
      ? await compare(compared, checked.settings).then(
          (comparison) => comparison.result,
          () => undefined,
        )
      : undefined;
  if (!isActive()) return;
  dispatch({
    type: "chips-checked",
    from: saved,
    settings: checked.settings,
    chipsStatus: checked.chipsStatus,
    result,
  });
  if (!changed || storage.getItem(STORAGE_KEY) !== savedText) return;
  try {
    saveSettings(storage, checked.settings);
  } catch {
    dispatch({ type: "noticed", notice: "settings-not-saved" });
  }
}
