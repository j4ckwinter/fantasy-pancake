import { useEffect, useMemo, useRef, useState } from "react";
import { settingsSchema, type Data, type Settings } from "@/lib/schemas";
import {
  analyze,
  evaluateTransfer,
  validateSquad,
  type Move,
  type TransferPlan,
  type Analysis,
} from "@/lib/model";
import { loadPlannerData, loadTeamPicks, loadPlayerHistories } from "./api";
import {
  restoreSettings,
  saveSettings,
  settingsFromImport,
  marketPricePick,
} from "./settings";
import { historyCandidates } from "./history-candidates";
import { plannerDataExpired } from "./freshness";
import { selectedPreview, type Selection } from "./selection";
function refreshEstimatedPrices(
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
async function prepareComparison(data: Data, settings: Settings) {
  const parsed = settingsSchema.parse(settings);
  const enriched = await loadPlayerHistories(
    data,
    historyCandidates(data, parsed),
  );
  return {
    ...enriched,
    settings: parsed,
    result: analyze(enriched.data, parsed),
  };
}

export function usePlanner() {
  const revision = useRef(0);
  const pendingOperation = useRef<number | null>(null);
  const loadedAt = useRef<number | null>(null);
  const [savedPlan, setSavedPlan] = useState(false);
  const detailRevision = useRef(0);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [playerData, setPlayerData] = useState<Data | null>(null);
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [customBusy, setCustomBusy] = useState(false);
  const [customError, setCustomError] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [teamId, setTeamId] = useState("");
  const [busy, setBusy] = useState("Loading players and fixtures…");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [planCategory, setPlanCategory] = useState<
    "singles" | "pair-now" | "roll-then-transfer"
  >("singles");
  const [editingTeam, setEditingTeam] = useState(false);
  const [confirmedPrices, setConfirmedPrices] = useState<number[]>([]);
  const [priceNotice, setPriceNotice] = useState("");
  const [result, setResult] = useState<Analysis | null>(null);
  const [reviewSnapshot, setReviewSnapshot] = useState<{
    settings: Settings;
    result: Analysis;
    selection: Selection | null;
    confirmedPrices: number[];
    priceNotice: string;
    notice: string;
    lineupIndex: number;
  } | null>(null);
  const [reload, setReload] = useState(0);
  const [lineupIndex, setLineupIndex] = useState(0);
  useEffect(() => {
    let active = true;
    loadPlannerData()
      .then(async (loaded) => {
        if (!active) return;
        loadedAt.current = Date.now();
        setData(loaded);
        setBusy("");
        try {
          const restored = restoreSettings(localStorage, loaded);
          if (restored.status === "restored") {
            setBusy("Restoring your team…");
            if (!restored.settings.teamName) {
              try {
                const imported = await loadTeamPicks(
                  String(restored.settings.entryId),
                );
                if (!active) return;
                restored.settings = {
                  ...restored.settings,
                  teamName: imported.teamName,
                };
                saveSettings(localStorage, restored.settings);
              } catch {
                // A missing name must not prevent restoring the saved squad.
              }
            }
            if (!active) return;
            setSavedPlan(true);
            setSettings(restored.settings);
            setTeamId(String(restored.settings.entryId));
            setNotice(
              "Saved settings restored. Check your current bank and remaining transfers. Selling prices will be checked only for shortlisted moves.",
            );
            setBusy("Loading recent matches and comparing transfer plans…");
            try {
              const comparison = await prepareComparison(
                loaded,
                restored.settings,
              );
              if (!active) return;
              setData(comparison.data);
              setResult(comparison.result);
            } catch (reason) {
              if (active)
                setError(
                  reason instanceof Error
                    ? reason.message
                    : "Please check your team settings.",
                );
            } finally {
              if (active) setBusy("");
            }
          } else if (restored.status === "invalid") {
            setNotice(
              "Saved settings are outdated or invalid. Import your team again.",
            );
          }
        } catch {
          setNotice(
            "Browser storage is unavailable or unreadable. You can still plan in this session.",
          );
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load FPL data.",
          );
          setBusy("");
        }
      });
    return () => {
      active = false;
    };
  }, [reload]);
  async function currentData() {
    if (data && !plannerDataExpired(loadedAt.current)) {
      return { data, loadedAt: loadedAt.current };
    }
    const loaded = await loadPlannerData();
    // Histories and fixtures belong to the same refresh cohort.
    return { data: { ...loaded, histories: {} }, loadedAt: Date.now() };
  }
  async function importSquad(entryId = teamId) {
    if (!data || busy || customBusy || pendingOperation.current !== null)
      return;
    const currentRevision = ++revision.current;
    pendingOperation.current = currentRevision;
    setError("");
    setBusy("Importing the latest published squad…");
    try {
      const fresh = await currentData();
      const imported = await loadTeamPicks(entryId);
      if (currentRevision !== revision.current) return;
      const importedSettings = settingsFromImport(
        fresh.data,
        Number(entryId),
        imported,
      );
      const squadErrors = validateSquad(fresh.data, importedSettings);
      if (settings && squadErrors.length)
        throw new Error(squadErrors.join(" "));
      const needsCorrection =
        imported.active_chip === "freehit" || squadErrors.length > 0;
      const comparison = needsCorrection
        ? null
        : await prepareComparison(fresh.data, importedSettings);
      if (currentRevision !== revision.current) return;
      loadedAt.current = fresh.loadedAt;
      setData(comparison?.data ?? fresh.data);
      setSettings(importedSettings);
      setTeamId(entryId);
      setSavedPlan(false);
      setResult(comparison?.result ?? null);
      setSelection(null);
      setCustomError("");
      setReviewSnapshot(null);
      setPlanCategory("singles");
      setPriceNotice("");
      setConfirmedPrices([]);
      setLineupIndex(0);
      setEditingTeam(needsCorrection);
      setReviewOpen(needsCorrection);
      if (squadErrors.length) setError(squadErrors.join(" "));
      setNotice(
        imported.active_chip === "freehit"
          ? "This is a Free Hit squad. Restore your permanent squad below before continuing."
          : "Bank is from the last deadline. Free transfers default to 1. Update these to your current FPL balances.",
      );
      if (comparison) persist(comparison.settings);
    } catch (reason) {
      if (currentRevision === revision.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "Could not import your squad.",
        );
    } finally {
      if (pendingOperation.current === currentRevision) {
        pendingOperation.current = null;
        setBusy("");
      }
    }
  }
  function update(next: Settings) {
    revision.current++;
    setSettings(next);
    setResult(null);
    setSelection(null);
    setCustomError("");
    setError("");
  }
  async function evaluate(next = settings, checkedPrices = confirmedPrices) {
    if (
      !data ||
      !next ||
      busy ||
      customBusy ||
      pendingOperation.current !== null
    )
      return;
    const currentRevision = ++revision.current;
    pendingOperation.current = currentRevision;
    setError("");
    setBusy("Loading recent matches and comparing transfer plans…");
    setResult(null);
    setSelection(null);
    try {
      const fresh = await currentData();
      const currentSettings = refreshEstimatedPrices(
        fresh.data,
        next,
        checkedPrices,
      );
      const comparison = await prepareComparison(fresh.data, currentSettings);
      if (currentRevision !== revision.current) return;
      loadedAt.current = fresh.loadedAt;
      setData(comparison.data);
      setSettings(comparison.settings);
      setResult(comparison.result);
      setLineupIndex(0);
      setReviewSnapshot(null);
      setPlanCategory("singles");
      setReviewOpen(false);
      setEditingTeam(false);
      setNotice("");
      try {
        saveSettings(localStorage, comparison.settings);
      } catch {
        setNotice(
          "Your settings could not be saved in this browser. Results are still available for this session.",
        );
      }
    } catch (reason) {
      if (currentRevision === revision.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "Please check your team settings.",
        );
    } finally {
      if (pendingOperation.current === currentRevision) {
        pendingOperation.current = null;
        setBusy("");
      }
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
      if (plannerDataExpired(loadedAt.current)) {
        const checked = [...new Set([...confirmedPrices, id])];
        setConfirmedPrices(checked);
        setSettings(next);
        void evaluate(next, checked);
        return;
      }
      revision.current++;
      const nextResult = analyze(data, next);
      setSettings(next);
      setConfirmedPrices((ids) => [...new Set([...ids, id])]);
      setResult(nextResult);
      setError("");
      setPriceNotice(
        "Selling price confirmed. The shortlist has been recalculated; unaffordable moves have been removed.",
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Check the selling price.",
      );
    }
  }

  function updateSquad(next: Settings) {
    setConfirmedPrices((ids) =>
      ids.filter((id) => next.squad.some((pick) => pick.id === id)),
    );
    update({
      ...next,
      lockedPlayerIds: next.lockedPlayerIds?.filter((id) =>
        next.squad.some((pick) => pick.id === id),
      ),
    });
  }
  function importAnother() {
    revision.current++;
    setReviewSnapshot(null);
    setReviewOpen(false);
    setEditingTeam(false);
    setSelection(null);
    setResult(null);
    setSettings(null);
    setSavedPlan(false);
    setConfirmedPrices([]);
    setNotice("");
  }
  function retry() {
    setError("");
    setBusy("Loading players and fixtures…");
    setReload((value) => value + 1);
  }
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
        : {
            selection: null,
            preview: null,
            previewError: "",
            previewSquadIdsByWeek: [],
          },
    [data, settings, selection, result],
  );
  function persist(next: Settings) {
    try {
      saveSettings(localStorage, next);
    } catch {
      setNotice(
        "Your settings could not be saved in this browser. Results are still available for this session.",
      );
    }
  }
  function toggleLock(id: number) {
    if (!data || !settings || busy || customBusy) return;
    revision.current++;
    const locks = settings.lockedPlayerIds ?? [];
    const next = {
      ...settings,
      lockedPlayerIds: locks.includes(id)
        ? locks.filter((value) => value !== id)
        : [...locks, id],
    };
    setSettings(next);
    if (plannerDataExpired(loadedAt.current)) {
      void evaluate(next);
      return;
    }
    setResult(analyze(data, next));
    setSelection(null);
    setCustomError("");
    persist(next);
  }
  function selectMove(move: Move, custom = false) {
    if (plannerDataExpired(loadedAt.current)) {
      void evaluate();
      return;
    }
    revision.current++;
    if (!result?.weeks.length) return;
    const name = (id: number) =>
      data?.bootstrap.elements.find((player) => player.id === id)?.web_name ??
      String(id);
    setSelection({
      key: `${move.outId}-${move.inId}`,
      custom,
      label: `${name(move.outId)} → ${name(move.inId)}`,
      actions: [{ week: result.weeks[0], outId: move.outId, inId: move.inId }],
      move,
    });
  }
  function selectPlan(plan: TransferPlan) {
    if (plannerDataExpired(loadedAt.current)) {
      void evaluate();
      return;
    }
    revision.current++;
    setSelection({
      key: plan.kind,
      label: plan.kind === "pair-now" ? "Two transfers now" : "Roll, then move",
      actions: plan.actions,
      plan,
    });
  }
  async function compareTransfer(outId: number, inId: number) {
    if (
      !data ||
      !settings ||
      customBusy ||
      busy ||
      pendingOperation.current !== null
    )
      return;
    const currentRevision = ++revision.current;
    pendingOperation.current = currentRevision;
    const expired = plannerDataExpired(loadedAt.current);
    setCustomBusy(true);
    setError("");
    setCustomError("");
    if (expired) {
      setResult(null);
      setSelection(null);
    }
    try {
      const fresh = await currentData();
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
      if (currentRevision !== revision.current) return;
      const evaluated = evaluateTransfer(
        enriched.data,
        currentSettings,
        outId,
        inId,
      );
      loadedAt.current = fresh.loadedAt;
      setData(enriched.data);
      setSettings(currentSettings);
      const nextResult = analyze(enriched.data, currentSettings);
      setResult(nextResult);
      const name = (id: number) =>
        enriched.data.bootstrap.elements.find((player) => player.id === id)
          ?.web_name ?? String(id);
      setSelection({
        key: `${outId}-${inId}`,
        custom: true,
        label: `${name(outId)} → ${name(inId)}`,
        actions: [{ week: nextResult.weeks[0], outId, inId }],
        move: evaluated.move,
      });
    } catch (reason) {
      if (currentRevision === revision.current) {
        const message =
          reason instanceof Error
            ? reason.message
            : "Could not compare this transfer.";
        setCustomError(message);
        if (expired) setError(message);
      }
    } finally {
      if (pendingOperation.current === currentRevision) {
        pendingOperation.current = null;
        setCustomBusy(false);
      }
    }
  }
  useEffect(() => {
    const refresh = () => {
      if (
        document.visibilityState !== "hidden" &&
        !busy &&
        !customBusy &&
        !reviewOpen &&
        !editingTeam &&
        !reviewSnapshot &&
        result &&
        settings &&
        plannerDataExpired(loadedAt.current)
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
  async function openPlayer(id: number) {
    const request = ++detailRevision.current;
    setPlayerId(id);
    setPlayerData(data);
    if (!data || data.histories?.[String(id)]) return;
    const enriched = await loadPlayerHistories(data, [id]);
    if (request === detailRevision.current) {
      setPlayerData(enriched.data);
    }
  }
  return {
    ...previewState,
    playerData: playerData ?? data,
    playerId,
    customBusy,
    customError,
    toggleLock,
    selectMove,
    selectPlan,
    compareTransfer,
    openPlayer,
    closePlayer: () => {
      detailRevision.current++;
      setPlayerId(null);
    },
    clearSelection: () => {
      revision.current++;
      setSelection(null);
    },
    data,
    settings,
    teamId,
    busy,
    error,
    notice,
    editingTeam,
    reviewOpen,
    confirmedPrices,
    priceNotice,
    result,
    lineupIndex,
    setTeamId,
    importSquad: () => importSquad(),
    savedPlan,
    refreshSavedTeam: () => settings && importSquad(String(settings.entryId)),
    update,
    updateSquad,
    evaluate: () => evaluate(),
    confirmSellingPrice,
    importAnother,
    retry,
    toggleEditing: () => setEditingTeam((editing) => !editing),
    planCategory,
    setPlanCategory,
    canReturnToShortlist: !!reviewSnapshot,
    hasTeamEdits:
      !!reviewSnapshot &&
      JSON.stringify(settings) !== JSON.stringify(reviewSnapshot.settings),
    cancelTeamEdit: () => {
      if (!reviewSnapshot || busy) return;
      revision.current++;
      setSettings(reviewSnapshot.settings);
      setResult(reviewSnapshot.result);
      setSelection(reviewSnapshot.selection);
      setConfirmedPrices(reviewSnapshot.confirmedPrices);
      setPriceNotice(reviewSnapshot.priceNotice);
      setNotice(reviewSnapshot.notice);
      setLineupIndex(reviewSnapshot.lineupIndex);
      setReviewSnapshot(null);
      setReviewOpen(false);
      setEditingTeam(false);
      setError("");
      setCustomError("");
      if (plannerDataExpired(loadedAt.current))
        void evaluate(reviewSnapshot.settings, reviewSnapshot.confirmedPrices);
    },
    editTeam: () => {
      if (!settings || !result || busy) return;
      setReviewSnapshot({
        settings,
        result,
        selection,
        confirmedPrices,
        priceNotice,
        notice,
        lineupIndex,
      });
      setReviewOpen(true);
      revision.current++;
      setResult(null);
      setSelection(null);
    },
    selectLineup: setLineupIndex,
  };
}
