import type { Dispatch } from "react";
import type { Data } from "@/lib/schemas";
import { errorMessage } from "@/lib/error-message";
import { loadTeamPicks } from "./api";
import { restoreSettings, saveSettings } from "./settings";
import { prepareComparison } from "./comparison";
import { checkTeamSettings, comparingPlans, restoringTeam } from "./messages";
import type { SessionAction } from "./session";

export async function restoreSavedTeam(
  loaded: Data,
  {
    storage,
    isActive,
    dispatch,
    showBusy,
    enriched,
  }: {
    storage: Storage;
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
  let saved = restored.settings;
  if (!saved.teamName) {
    try {
      const imported = await loadTeamPicks(String(saved.entryId));
      if (!isActive()) return;
      saved = { ...saved, teamName: imported.teamName };
      saveSettings(storage, saved);
    } catch {
      // A missing name must not prevent restoring the saved squad.
    }
  }
  if (!isActive()) return;
  dispatch({ type: "restored", settings: saved });
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
