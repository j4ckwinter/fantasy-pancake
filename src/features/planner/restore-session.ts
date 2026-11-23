import type { Dispatch } from "react";
import type { Data, Settings } from "@/lib/schemas";
import { errorMessage } from "@/lib/error-message";
import { loadTeamPicks } from "./api";
import {
  restoreSettings,
  saveSettings,
  type SettingsStorage,
} from "./settings";
import { prepareComparison } from "./comparison";
import { checkTeamSettings, comparingPlans, restoringTeam } from "./messages";
import type { SessionAction } from "./session";

async function withTeamName(settings: Settings) {
  if (settings.teamName) return settings;
  try {
    const imported = await loadTeamPicks(String(settings.entryId));
    return { ...settings, teamName: imported.teamName };
  } catch {
    return settings;
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
  }: {
    storage: SettingsStorage;
    isActive: () => boolean;
    dispatch: Dispatch<SessionAction>;
    showBusy: (message: string) => void;
    enriched: (data: Data) => void;
  },
) {
  const restored = restoreSettings(storage, loaded);
  if (restored.status === "invalid") {
    dispatch({ type: "noticed", notice: "settings-invalid" });
    return;
  }
  if (restored.status !== "restored") return;
  showBusy(restoringTeam);
  const saved = await withTeamName(restored.settings);
  if (!isActive()) return;
  dispatch({ type: "restored", settings: saved });
  if (saved !== restored.settings) {
    try {
      saveSettings(storage, saved);
    } catch {
      dispatch({ type: "noticed", notice: "settings-not-saved" });
    }
  }
  showBusy(comparingPlans);
  try {
    const comparison = await prepareComparison(loaded, saved);
    if (!isActive()) return;
    enriched(comparison.data);
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
}
