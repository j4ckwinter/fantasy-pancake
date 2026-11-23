import { errorMessage } from "@/lib/error-message";
import { findPlayer } from "./players";
import {
  evaluatePlan,
  evaluateTransfer,
  previewCaptaincy,
  previewTransfers,
  type Analysis,
  type Captaincy,
  type Move,
  type PlanVariant,
  type TransferPlan,
} from "@/lib/model";
import type { Data, Player, Settings } from "@/lib/schemas";

type SelectionBase = {
  key: string;
  label: string;
  actions: TransferPlan["actions"];
};

export type Selection =
  | (SelectionBase & { kind: "move"; move: Move; custom: boolean })
  | (SelectionBase & { kind: "plan"; plan: TransferPlan });

export function selectedOption(selection: Selection): Move | TransferPlan {
  return selection.kind === "move" ? selection.move : selection.plan;
}

export type PlanCategory = "singles" | TransferPlan["kind"];

export const planVariantLabels: Record<PlanVariant, string> = {
  best: "Recommended plan",
  "no-hits": "No hits",
  "fewer-moves": "One move only",
  "bank-first": "Bank first",
  "move-now": "Move now",
};

export function planLabel(plan: TransferPlan): string {
  switch (plan.kind) {
    case "plan-ahead":
      return planVariantLabels[plan.variant];
    case "pair-now":
      return "Two transfers now";
    case "roll-then-transfer":
      return "Roll, then move";
  }
}

export function planKey(plan: TransferPlan): string {
  return [
    plan.kind === "plan-ahead" ? `${plan.kind}:${plan.variant}` : plan.kind,
    ...plan.actions.map(
      (action) => `${action.week}-${action.outId}-${action.inId}`,
    ),
  ].join("/");
}

export const planCategoryLabels: Record<PlanCategory, string> = {
  singles: "Singles",
  "plan-ahead": "Plan ahead",
  "pair-now": "Two transfers",
  "roll-then-transfer": "Roll then move",
};

export const emptyPreview: {
  selection: null;
  preview: null;
  previewError: string;
  previewCaptaincy: Captaincy[] | null;
} = {
  selection: null,
  preview: null,
  previewError: "",
  previewCaptaincy: null,
};

export function pricesChecked(
  actions: Selection["actions"],
  confirmedPrices: number[],
) {
  return actions.every((action) => confirmedPrices.includes(action.outId));
}

export function transferSelection(
  players: Player[],
  week: number,
  move: Move,
  custom: boolean,
): Selection {
  const name = (id: number) => findPlayer(players, id)?.web_name ?? String(id);
  return {
    kind: "move",
    key: `${move.outId}-${move.inId}`,
    custom,
    label: `${name(move.outId)} → ${name(move.inId)}`,
    actions: [{ week, outId: move.outId, inId: move.inId }],
    move,
  };
}

export function planSelection(plan: TransferPlan): Selection {
  return {
    kind: "plan",
    key: planKey(plan),
    label: planLabel(plan),
    actions: plan.actions,
    plan,
  };
}

function sameTransfers(a: TransferPlan, b: TransferPlan) {
  const pairs = (plan: TransferPlan) =>
    plan.actions
      .map((action) => `${action.outId}:${action.inId}`)
      .sort()
      .join(",");
  return a.kind === b.kind && pairs(a) === pairs(b);
}

function reselectMove(
  previous: Extract<Selection, { kind: "move" }>,
  result: Analysis,
  data: Data,
  settings: Settings,
): Selection | null {
  const { outId, inId } = previous.move;
  const players = data.bootstrap.elements;
  const week = result.weeks[0];
  const listed = result.moves.find(
    (move) => move.outId === outId && move.inId === inId,
  );
  if (listed) return transferSelection(players, week, listed, previous.custom);
  if (!previous.custom) return null;
  try {
    const { move } = evaluateTransfer(data, settings, outId, inId);
    return transferSelection(players, week, move, true);
  } catch {
    return null;
  }
}

export function reselect(
  previous: Selection | null,
  result: Analysis,
  data: Data,
  settings: Settings,
): Selection | null {
  if (!previous || !result.weeks.length) return null;
  if (previous.kind === "move")
    return reselectMove(previous, result, data, settings);
  const plan = result.plans.find((candidate) =>
    sameTransfers(candidate, previous.plan),
  );
  return plan ? planSelection(plan) : null;
}

export function selectedPreview(
  data: Data,
  settings: Settings,
  selection: Selection | null,
) {
  if (!selection) return emptyPreview;
  try {
    const evaluated =
      selection.kind === "move"
        ? evaluateTransfer(
            data,
            settings,
            selection.move.outId,
            selection.move.inId,
          )
        : null;
    const preview =
      evaluated?.lineups ?? previewTransfers(data, settings, selection.actions);
    const captaincy = previewCaptaincy(data, settings, selection.actions);
    const plan =
      selection.kind === "plan"
        ? evaluatePlan(data, settings, selection.plan)
        : undefined;
    return {
      selection:
        selection.kind === "move"
          ? { ...selection, move: evaluated?.move ?? selection.move }
          : { ...selection, plan: plan ?? selection.plan },
      preview,
      previewError: "",
      previewCaptaincy: captaincy,
    };
  } catch (reason) {
    return {
      selection,
      preview: null,
      previewError: errorMessage(reason, "This option is no longer available."),
      previewCaptaincy: null,
    };
  }
}
