import { errorMessage } from "@/lib/error-message";
import { findPlayer } from "./players";
import {
  evaluateTransfer,
  previewCaptaincy,
  previewTransfers,
  type Analysis,
  type Captaincy,
  type Lineup,
  type Move,
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

export const planLabels: Record<TransferPlan["kind"], string> = {
  "pair-now": "Two transfers now",
  "roll-then-transfer": "Roll, then move",
};

export const planCategoryLabels: Record<PlanCategory, string> = {
  singles: "Singles",
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
    key: plan.kind,
    label: planLabels[plan.kind],
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
  baseline: Lineup[],
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
        ? {
            ...selection.plan,
            gain:
              Math.round(
                (preview.reduce((sum, lineup) => sum + lineup.score, 0) -
                  baseline.reduce((sum, lineup) => sum + lineup.score, 0) -
                  selection.plan.hit) *
                  100,
              ) / 100,
            remainingBank: selection.actions.reduce(
              (bank, action) =>
                bank +
                (settings.squad.find((pick) => pick.id === action.outId)
                  ?.sellingPrice ?? 0) -
                (data.bootstrap.elements.find(
                  (player) => player.id === action.inId,
                )?.now_cost ?? 0),
              settings.bank,
            ),
          }
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
