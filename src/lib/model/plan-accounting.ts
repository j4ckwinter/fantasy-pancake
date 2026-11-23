import type { PlanAccount, PlanWeek, TransferAction } from "./types";
import { bestLineup } from "./lineup";
import { applyTransfers } from "./transfer-legality";
import {
  freeTransferCap,
  freeTransfersLeft,
  nextWeekFreeTransfers,
  transferHit,
} from "./transfer-rules";
import { roundScore } from "./round-score";
import type { TransferContext } from "./transfer-preview";

export function accountPlan(
  context: TransferContext,
  actions: TransferAction[],
): PlanAccount {
  const { data, settings, weeks, scores, baseline, rules } = context;
  if (actions.some((action) => !weeks.includes(action.week)))
    throw new Error("Choose a gameweek within the forecast horizon.");
  const cap = freeTransferCap(data.bootstrap.game_settings);
  let state = context.start;
  let freeTransfers = settings.freeTransfers;
  let freeTransfersAfterPlan = freeTransfers;
  const planWeeks: PlanWeek[] = weeks.map((week, index) => {
    const moves = actions.filter((action) => action.week === week);
    state = applyTransfers(rules, state, moves);
    const hit = transferHit(moves.length, freeTransfers);
    const left = freeTransfersLeft(moves.length, freeTransfers);
    if (moves.length) freeTransfersAfterPlan = left;
    const score = bestLineup(data, state.squad, scores[index]).score;
    const planned: PlanWeek = {
      week,
      actions: moves,
      hit,
      freeTransfersBefore: freeTransfers,
      freeTransfersAfter: left,
      bank: state.bank,
      score,
      gain: score - baseline[index].score - hit,
    };
    freeTransfers = nextWeekFreeTransfers(left, cap);
    return planned;
  });
  return {
    actions,
    weeks: planWeeks.map((week) => ({
      ...week,
      score: roundScore(week.score),
      gain: roundScore(week.gain),
    })),
    gain: roundScore(planWeeks.reduce((sum, week) => sum + week.gain, 0)),
    hit: planWeeks.reduce((sum, week) => sum + week.hit, 0),
    remainingBank: state.bank,
    freeTransfersAfterPlan,
  };
}
