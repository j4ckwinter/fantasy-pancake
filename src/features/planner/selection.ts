import {
  evaluateTransfer,
  previewTransfers,
  type Lineup,
  type Move,
  type TransferPlan,
} from "@/lib/model";
import type { Data, Settings } from "@/lib/schemas";

export type Selection = {
  key: string;
  custom?: boolean;
  label: string;
  actions: TransferPlan["actions"];
  move?: Move;
  plan?: TransferPlan;
};

export function selectedPreview(
  data: Data,
  settings: Settings,
  selection: Selection | null,
  weeks: number[],
  baseline: Lineup[],
) {
  if (!selection)
    return {
      selection,
      preview: null,
      previewError: "",
      previewSquadIdsByWeek: [],
    };
  try {
    const evaluated = selection.move
      ? evaluateTransfer(
          data,
          settings,
          selection.move.outId,
          selection.move.inId,
        )
      : null;
    const preview =
      evaluated?.lineups ?? previewTransfers(data, settings, selection.actions);
    const previewSquadIdsByWeek = weeks.map((week) => {
      let ids = settings.squad.map((pick) => pick.id);
      for (const action of selection.actions) {
        if (action.week <= week)
          ids = ids.map((id) => (id === action.outId ? action.inId : id));
      }
      return ids;
    });
    const plan = selection.plan
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
      selection: {
        ...selection,
        ...(evaluated ? { move: evaluated.move } : {}),
        ...(plan ? { plan } : {}),
      },
      preview,
      previewError: "",
      previewSquadIdsByWeek,
    };
  } catch (reason) {
    return {
      selection,
      preview: null,
      previewError:
        reason instanceof Error
          ? reason.message
          : "This option is no longer available.",
      previewSquadIdsByWeek: [],
    };
  }
}
