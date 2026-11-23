import type { Analysis } from "@/lib/model";
import type { Settings } from "@/lib/schemas";
import type { Notice } from "./messages";
import type { PlanCategory, Selection } from "./selection";

type ReviewSnapshot = {
  settings: Settings;
  result: Analysis;
  selection: Selection | null;
  confirmedPrices: number[];
  priceConfirmed: boolean;
  notice: Notice | null;
  lineupIndex: number;
};

export type Session = {
  settings: Settings | null;
  teamId: string;
  savedPlan: boolean;
  result: Analysis | null;
  selection: Selection | null;
  planCategory: PlanCategory;
  lineupIndex: number;
  confirmedPrices: number[];
  priceConfirmed: boolean;
  notice: Notice | null;
  error: string;
  customError: string;
  editingTeam: boolean;
  reviewOpen: boolean;
  reviewSnapshot: ReviewSnapshot | null;
};

export type SessionAction =
  | { type: "team-id-changed"; teamId: string }
  | { type: "noticed"; notice: Notice }
  | { type: "saved" }
  | { type: "failed"; error: string }
  | { type: "restored"; settings: Settings }
  | { type: "restore-compared"; result: Analysis }
  | { type: "import-started" }
  | {
      type: "imported";
      teamId: string;
      settings: Settings;
      result: Analysis | null;
      freeHit: boolean;
    }
  | { type: "evaluation-started" }
  | { type: "evaluated"; settings: Settings; result: Analysis }
  | { type: "custom-comparison-started"; expired: boolean }
  | {
      type: "custom-compared";
      settings: Settings;
      result: Analysis;
      selection: Selection;
    }
  | { type: "custom-comparison-failed"; error: string; expired: boolean }
  | { type: "settings-edited"; settings: Settings }
  | { type: "squad-edited"; settings: Settings }
  | {
      type: "price-confirmed";
      settings: Settings;
      id: number;
      result: Analysis;
    }
  | { type: "price-confirmed-on-stale-data"; settings: Settings; id: number }
  | { type: "lock-toggled"; settings: Settings; result: Analysis | null }
  | { type: "selected"; selection: Selection }
  | { type: "selection-cleared" }
  | { type: "category-changed"; category: PlanCategory }
  | { type: "lineup-selected"; index: number }
  | { type: "edit-started" }
  | { type: "edit-cancelled" }
  | { type: "editing-toggled" }
  | { type: "team-switched" }
  | { type: "retried" };

export const initialSession: Session = {
  settings: null,
  teamId: "",
  savedPlan: false,
  result: null,
  selection: null,
  planCategory: "singles",
  lineupIndex: 0,
  confirmedPrices: [],
  priceConfirmed: false,
  notice: null,
  error: "",
  customError: "",
  editingTeam: false,
  reviewOpen: false,
  reviewSnapshot: null,
};

function withPrice(ids: number[], id: number) {
  return [...new Set([...ids, id])];
}

function lineupWithin(index: number, result: Analysis) {
  return Math.max(0, Math.min(index, result.weeks.length - 1));
}

function inSquad(settings: Settings) {
  return (id: number) => settings.squad.some((pick) => pick.id === id);
}

export function sessionReducer(
  session: Session,
  action: SessionAction,
): Session {
  switch (action.type) {
    case "team-id-changed":
      return { ...session, teamId: action.teamId };
    case "noticed":
      return { ...session, notice: action.notice };
    case "saved":
      return session.notice === "settings-not-saved"
        ? { ...session, notice: null }
        : session;
    case "failed":
      return { ...session, error: action.error };
    case "restored":
      return {
        ...session,
        savedPlan: true,
        settings: action.settings,
        teamId: String(action.settings.entryId),
        notice: "restored",
      };
    case "restore-compared":
      return {
        ...session,
        result: action.result,
        lineupIndex: lineupWithin(session.lineupIndex, action.result),
      };
    case "import-started":
      return { ...session, error: "" };
    case "imported": {
      const needsCorrection = action.result === null;
      return {
        ...session,
        settings: action.settings,
        teamId: action.teamId,
        savedPlan: false,
        result: action.result,
        selection: null,
        customError: "",
        reviewSnapshot: null,
        planCategory: "singles",
        priceConfirmed: false,
        confirmedPrices: [],
        lineupIndex: 0,
        editingTeam: needsCorrection,
        reviewOpen: needsCorrection,
        notice: action.freeHit ? "free-hit" : "import-caveat",
      };
    }
    case "evaluation-started":
      return { ...session, error: "", result: null, selection: null };
    case "evaluated":
      return {
        ...session,
        priceConfirmed: false,
        settings: action.settings,
        result: action.result,
        lineupIndex: 0,
        reviewSnapshot: null,
        planCategory: "singles",
        reviewOpen: false,
        editingTeam: false,
        notice: null,
      };
    case "custom-comparison-started":
      return {
        ...session,
        error: "",
        customError: "",
        ...(action.expired ? { result: null, selection: null } : {}),
      };
    case "custom-compared":
      return {
        ...session,
        settings: action.settings,
        result: action.result,
        lineupIndex: lineupWithin(session.lineupIndex, action.result),
        selection: action.selection,
      };
    case "custom-comparison-failed":
      return {
        ...session,
        customError: action.error,
        ...(action.expired ? { error: action.error } : {}),
      };
    case "settings-edited":
      return {
        ...session,
        priceConfirmed: false,
        settings: action.settings,
        result: null,
        selection: null,
        customError: "",
        error: "",
      };
    case "squad-edited": {
      const kept = inSquad(action.settings);
      return sessionReducer(
        {
          ...session,
          confirmedPrices: session.confirmedPrices.filter(kept),
        },
        {
          type: "settings-edited",
          settings: {
            ...action.settings,
            lockedPlayerIds: action.settings.lockedPlayerIds?.filter(kept),
          },
        },
      );
    }
    case "price-confirmed":
      return {
        ...session,
        settings: action.settings,
        confirmedPrices: withPrice(session.confirmedPrices, action.id),
        result: action.result,
        lineupIndex: lineupWithin(session.lineupIndex, action.result),
        error: "",
        priceConfirmed: true,
      };
    case "price-confirmed-on-stale-data":
      return {
        ...session,
        settings: action.settings,
        confirmedPrices: withPrice(session.confirmedPrices, action.id),
      };
    case "lock-toggled":
      return action.result
        ? {
            ...session,
            settings: action.settings,
            result: action.result,
            lineupIndex: lineupWithin(session.lineupIndex, action.result),
            selection: null,
            customError: "",
          }
        : { ...session, settings: action.settings };
    case "selected":
      return { ...session, selection: action.selection, priceConfirmed: false };
    case "selection-cleared":
      return { ...session, selection: null, priceConfirmed: false };
    case "category-changed":
      return { ...session, planCategory: action.category };
    case "lineup-selected":
      return { ...session, lineupIndex: action.index };
    case "edit-started":
      if (!session.settings || !session.result) return session;
      return {
        ...session,
        reviewSnapshot: {
          settings: session.settings,
          result: session.result,
          selection: session.selection,
          confirmedPrices: session.confirmedPrices,
          priceConfirmed: session.priceConfirmed,
          notice: session.notice,
          lineupIndex: session.lineupIndex,
        },
        reviewOpen: true,
        result: null,
        selection: null,
      };
    case "edit-cancelled": {
      const snapshot = session.reviewSnapshot;
      if (!snapshot) return session;
      return {
        ...session,
        ...snapshot,
        reviewSnapshot: null,
        reviewOpen: false,
        editingTeam: false,
        error: "",
        customError: "",
      };
    }
    case "editing-toggled":
      return { ...session, editingTeam: !session.editingTeam };
    case "team-switched":
      return { ...initialSession, teamId: session.teamId };
    case "retried":
      return { ...session, error: "" };
  }
}

export function hasTeamEdits(session: Session) {
  return (
    !!session.reviewSnapshot &&
    JSON.stringify(session.settings) !==
      JSON.stringify(session.reviewSnapshot.settings)
  );
}
