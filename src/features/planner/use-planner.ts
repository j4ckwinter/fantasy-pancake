import { useEffect, useMemo, useReducer, useState } from "react";
import { settingsSchema, type Settings } from "@/lib/schemas";
import {
  analyze,
  evaluateTransfer,
  validateSquad,
  type Move,
  type TransferPlan,
} from "@/lib/model";
import { errorMessage } from "@/lib/error-message";
import { loadPlannerData, loadTeamPicks, loadPlayerHistories } from "./api";
import {
  refreshEstimatedPrices,
  saveSettings,
  settingsFromImport,
} from "./settings";
import { restoreSavedTeam } from "./restore-session";
import {
  emptyPreview,
  planSelection,
  selectedPreview,
  transferSelection,
  type PlanCategory,
} from "./selection";
import {
  checkTeamSettings,
  comparingPlans,
  importingSquad,
  loadingPlannerData,
} from "./messages";
import { prepareComparison } from "./comparison";
import { hasTeamEdits, initialSession, sessionReducer } from "./session";
import { useOperation } from "./use-operation";
import { usePlannerData } from "./use-planner-data";
import { usePlayerDetails } from "./use-player-details";

export function usePlanner() {
  const [session, dispatch] = useReducer(sessionReducer, initialSession);
  const operation = useOperation();
  const planner = usePlannerData();
  const details = usePlayerDetails(planner.data);
  const [reload, setReload] = useState(0);
  const { data } = planner;
  const { settings, result, selection, confirmedPrices } = session;
  const { busy, customBusy } = operation;

  function persist(next: Settings) {
    try {
      saveSettings(localStorage, next);
    } catch {
      dispatch({ type: "noticed", notice: "settings-not-saved" });
    }
  }

  const { loaded: dataLoaded, enriched: dataEnriched } = planner;
  const { setBusy } = operation;
  useEffect(() => {
    let active = true;
    const isActive = () => active;
    loadPlannerData()
      .then(async (loaded) => {
        if (!active) return;
        dataLoaded(loaded);
        setBusy("");
        try {
          await restoreSavedTeam(loaded, {
            storage: localStorage,
            isActive,
            dispatch,
            showBusy: setBusy,
            enriched: dataEnriched,
          });
        } catch {
          dispatch({ type: "noticed", notice: "storage-unavailable" });
        }
      })
      .catch((reason: unknown) => {
        if (!active) return;
        dispatch({
          type: "failed",
          error: errorMessage(reason, "Could not load FPL data."),
        });
        setBusy("");
      });
    return () => {
      active = false;
    };
  }, [reload, dataLoaded, dataEnriched, setBusy]);

  async function importSquad(entryId = session.teamId) {
    if (!data || operation.blocked()) return;
    const id = operation.begin();
    dispatch({ type: "import-started" });
    operation.setBusy(importingSquad);
    try {
      const fresh = await planner.current();
      const imported = await loadTeamPicks(entryId);
      if (!operation.isCurrent(id)) return;
      const importedSettings = settingsFromImport(
        fresh.data,
        Number(entryId),
        imported,
      );
      const squadErrors = validateSquad(fresh.data, importedSettings);
      if (settings && squadErrors.length)
        throw new Error(squadErrors.join(" "));
      const freeHit = imported.active_chip === "freehit";
      const comparison =
        freeHit || squadErrors.length
          ? null
          : await prepareComparison(fresh.data, importedSettings);
      if (!operation.isCurrent(id)) return;
      planner.loaded(comparison?.data ?? fresh.data, fresh.loadedAt);
      dispatch({
        type: "imported",
        teamId: entryId,
        settings: importedSettings,
        result: comparison?.result ?? null,
        squadErrors,
        freeHit,
      });
      if (comparison) persist(comparison.settings);
    } catch (reason) {
      if (operation.isCurrent(id))
        dispatch({
          type: "failed",
          error: errorMessage(reason, "Could not import your squad."),
        });
    } finally {
      operation.finish(id, () => operation.setBusy(""));
    }
  }

  async function evaluate(next = settings, checkedPrices = confirmedPrices) {
    if (!data || !next || operation.blocked()) return;
    const id = operation.begin();
    dispatch({ type: "evaluation-started" });
    operation.setBusy(comparingPlans);
    try {
      const fresh = await planner.current();
      const comparison = await prepareComparison(
        fresh.data,
        refreshEstimatedPrices(fresh.data, next, checkedPrices),
      );
      if (!operation.isCurrent(id)) return;
      planner.loaded(comparison.data, fresh.loadedAt);
      dispatch({
        type: "evaluated",
        settings: comparison.settings,
        result: comparison.result,
      });
      persist(comparison.settings);
    } catch (reason) {
      if (operation.isCurrent(id))
        dispatch({
          type: "failed",
          error: errorMessage(reason, checkTeamSettings),
        });
    } finally {
      operation.finish(id, () => operation.setBusy(""));
    }
  }

  function confirmSellingPrice(id: number, sellingPrice: number) {
    if (!data || !settings || busy || customBusy) return;
    try {
      const next = settingsSchema.parse({
        ...settings,
        squad: settings.squad.map((pick) =>
          pick.id === id ? { ...pick, sellingPrice } : pick,
        ),
      });
      if (planner.expired()) {
        dispatch({ type: "price-confirmed-on-stale-data", settings: next, id });
        void evaluate(next, [...new Set([...confirmedPrices, id])]);
        return;
      }
      operation.invalidate();
      dispatch({
        type: "price-confirmed",
        settings: next,
        id,
        result: analyze(data, next),
      });
    } catch (reason) {
      dispatch({
        type: "failed",
        error: errorMessage(reason, "Check the selling price."),
      });
    }
  }

  function editSettings(next: Settings) {
    operation.invalidate();
    dispatch({ type: "settings-edited", settings: next });
  }

  function editSquad(next: Settings) {
    operation.invalidate();
    dispatch({ type: "squad-edited", settings: next });
  }

  function toggleLock(id: number) {
    if (!data || !settings || busy || customBusy) return;
    operation.invalidate();
    const locks = settings.lockedPlayerIds ?? [];
    const next = {
      ...settings,
      lockedPlayerIds: locks.includes(id)
        ? locks.filter((value) => value !== id)
        : [...locks, id],
    };
    if (planner.expired()) {
      dispatch({ type: "lock-toggled", settings: next, result: null });
      void evaluate(next);
      return;
    }
    dispatch({
      type: "lock-toggled",
      settings: next,
      result: analyze(data, next),
    });
    persist(next);
  }

  function selectMove(move: Move) {
    if (planner.expired()) {
      void evaluate();
      return;
    }
    operation.invalidate();
    if (!result?.weeks.length) return;
    dispatch({
      type: "selected",
      selection: transferSelection(
        data?.bootstrap.elements ?? [],
        result.weeks[0],
        move,
        false,
      ),
    });
  }

  function selectPlan(plan: TransferPlan) {
    if (planner.expired()) {
      void evaluate();
      return;
    }
    operation.invalidate();
    dispatch({ type: "selected", selection: planSelection(plan) });
  }

  async function compareTransfer(outId: number, inId: number) {
    if (!data || !settings || operation.blocked()) return;
    const id = operation.begin();
    const expired = planner.expired();
    operation.setCustomBusy(true);
    dispatch({ type: "custom-comparison-started", expired });
    try {
      const fresh = await planner.current();
      const currentSettings = refreshEstimatedPrices(
        fresh.data,
        settings,
        confirmedPrices,
      );
      const comparison = await prepareComparison(fresh.data, currentSettings);
      const enriched = await loadPlayerHistories(comparison.data, [
        outId,
        inId,
      ]);
      if (!operation.isCurrent(id)) return;
      const evaluated = evaluateTransfer(
        enriched.data,
        currentSettings,
        outId,
        inId,
      );
      planner.loaded(enriched.data, fresh.loadedAt);
      const nextResult = analyze(enriched.data, currentSettings);
      dispatch({
        type: "custom-compared",
        settings: currentSettings,
        result: nextResult,
        selection: transferSelection(
          enriched.data.bootstrap.elements,
          nextResult.weeks[0],
          evaluated.move,
          true,
        ),
      });
    } catch (reason) {
      if (operation.isCurrent(id))
        dispatch({
          type: "custom-comparison-failed",
          error: errorMessage(reason, "Could not compare this transfer."),
          expired,
        });
    } finally {
      operation.finish(id, () => operation.setCustomBusy(false));
    }
  }

  function switchTeam() {
    operation.invalidate();
    dispatch({ type: "team-switched" });
  }

  function retry() {
    dispatch({ type: "retried" });
    operation.setBusy(loadingPlannerData);
    setReload((value) => value + 1);
  }

  function cancelTeamEdit() {
    const snapshot = session.reviewSnapshot;
    if (!snapshot || busy) return;
    operation.invalidate();
    dispatch({ type: "edit-cancelled" });
    if (planner.expired())
      void evaluate(snapshot.settings, snapshot.confirmedPrices);
  }

  function editTeam() {
    if (!settings || !result || busy) return;
    dispatch({ type: "edit-started" });
    operation.invalidate();
  }

  useEffect(() => {
    const refresh = () => {
      if (
        document.visibilityState !== "hidden" &&
        !busy &&
        !customBusy &&
        !session.reviewOpen &&
        !session.editingTeam &&
        !session.reviewSnapshot &&
        result &&
        settings &&
        planner.expired()
      ) {
        void evaluate();
      }
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  });

  const previewState = useMemo(
    () =>
      data && settings
        ? selectedPreview(
            data,
            settings,
            selection,
            result?.weeks ?? [],
            result?.baseline ?? [],
          )
        : emptyPreview,
    [data, settings, selection, result],
  );

  return {
    ...previewState,
    ...details,
    data,
    settings,
    result,
    busy,
    customBusy,
    error: session.error,
    customError: session.customError,
    notice: session.notice,
    teamId: session.teamId,
    savedPlan: session.savedPlan,
    editingTeam: session.editingTeam,
    reviewOpen: session.reviewOpen,
    confirmedPrices,
    priceConfirmed: session.priceConfirmed,
    lineupIndex: session.lineupIndex,
    planCategory: session.planCategory,
    canReturnToShortlist: !!session.reviewSnapshot,
    hasTeamEdits: hasTeamEdits(session),
    setTeamId: (teamId: string) =>
      dispatch({ type: "team-id-changed", teamId }),
    setPlanCategory: (category: PlanCategory) =>
      dispatch({ type: "category-changed", category }),
    selectLineup: (index: number) =>
      dispatch({ type: "lineup-selected", index }),
    toggleEditing: () => dispatch({ type: "editing-toggled" }),
    clearSelection: () => {
      operation.invalidate();
      dispatch({ type: "selection-cleared" });
    },
    importSquad: () => importSquad(),
    refreshSavedTeam: () => settings && importSquad(String(settings.entryId)),
    update: editSettings,
    updateSquad: editSquad,
    evaluate: () => evaluate(),
    confirmSellingPrice,
    importAnother: switchTeam,
    retry,
    toggleLock,
    selectMove,
    selectPlan,
    compareTransfer,
    cancelTeamEdit,
    editTeam,
  };
}
