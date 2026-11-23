import type { Data, Settings } from "./schemas";
import type { Analysis, Move } from "./model/types";
import { checkTransfers } from "./model/transfer-legality";
import { planTransfers } from "./model/planning";
import {
  transferContext,
  evaluatePreparedTransfer,
  withAvailabilitySensitivity,
} from "./model/transfer-preview";
import { freeTransferCap } from "./model/transfer-rules";
import { roundScore } from "./model/round-score";
import { captaincyByWeek } from "./model/captaincy-preview";

export { evaluateTransfer, previewTransfers } from "./model/transfer-preview";
export { previewCaptaincy } from "./model/captaincy-preview";
export type { BenchSlot, CaptainOption, Captaincy } from "./model/captaincy";
export { playerForecast, usableHistory } from "./model/forecast-history";
export type {
  Analysis,
  Lineup,
  Move,
  TransferPlan,
  TransferAction,
} from "./model/types";
export { overLimitClubs, validateSquad } from "./model/squad-rules";
export { upcomingWeeks } from "./model/schedule";
export { scorePlayer } from "./model/scoring";
export { bestLineup } from "./model/lineup";
export {
  FORECAST_ACCURACY,
  type ForecastAccuracy,
} from "./model/forecast-accuracy";
export {
  TRANSFER_HIT_POINTS,
  freeTransferCap,
  nextWeekFreeTransfers,
} from "./model/transfer-rules";

const NET_GAIN_THRESHOLD_POINTS = 2;
const AT_CAP_NET_GAIN_THRESHOLD_POINTS = 1;
const SHORTLIST_INCOMING_PLAYERS = 3;
const SHORTLIST_OUTGOING_PER_INCOMING = 3;
const AT_CAP_ROLL_NOTE =
  " You are at the free-transfer cap, so rolling cannot add another saved transfer.";

function atFreeTransferCap(data: Data, settings: Settings): boolean {
  return (
    settings.freeTransfers >= freeTransferCap(data.bootstrap.game_settings)
  );
}

export function netGainThreshold(data: Data, settings: Settings): number {
  return atFreeTransferCap(data, settings)
    ? AT_CAP_NET_GAIN_THRESHOLD_POINTS
    : NET_GAIN_THRESHOLD_POINTS;
}

export function analyze(data: Data, settings: Settings): Analysis {
  const context = transferContext(data, settings);
  const { weeks, squad, scores, baseline } = context;
  const atCap = atFreeTransferCap(data, settings);
  const threshold = netGainThreshold(data, settings);
  if (!weeks.length)
    return {
      weeks,
      baseline: [],
      captaincy: [],
      moves: [],
      plans: [],
      threshold,
      rollReason:
        "No upcoming gameweeks are available. Recheck when the next season or schedule is published.",
    };
  const moves = worthwhileMoves(context, threshold);
  const plans = planTransfers(
    data,
    settings,
    weeks,
    squad,
    scores,
    baseline,
    threshold,
  );
  return {
    weeks,
    baseline: baseline.map((lineup) => ({
      ...lineup,
      score: roundScore(lineup.score),
    })),
    captaincy: captaincyByWeek(
      context,
      baseline.map((lineup) => ({ squad, lineup })),
    ),
    moves: withAvailabilitySensitivity(context, shortlist(moves)),
    plans,
    threshold,
    rollReason: rollReason(threshold, atCap, moves.length, plans.length),
  };
}

function worthwhileMoves(
  context: ReturnType<typeof transferContext>,
  threshold: number,
): Move[] {
  const { data, squad, rules, start } = context;
  const moves: Move[] = [];
  for (const outgoing of squad) {
    for (const incoming of data.bootstrap.elements) {
      const swap = { outId: outgoing.id, inId: incoming.id };
      if (!checkTransfers(rules, start, [swap]).legal) continue;
      const { move } = evaluatePreparedTransfer(
        context,
        outgoing.id,
        incoming.id,
      );
      if (move.gain > threshold) moves.push(move);
    }
  }
  return moves.sort(
    (a, b) =>
      b.gain - a.gain ||
      b.immediateGain - a.immediateGain ||
      a.inId - b.inId ||
      a.outId - b.outId,
  );
}

function shortlist(rankedMoves: Move[]): Move[] {
  const incomingIds = [...new Set(rankedMoves.map((move) => move.inId))].slice(
    0,
    SHORTLIST_INCOMING_PLAYERS,
  );
  const counts = new Map<number, number>();
  return rankedMoves.filter((move) => {
    const count = counts.get(move.inId) ?? 0;
    if (
      !incomingIds.includes(move.inId) ||
      count >= SHORTLIST_OUTGOING_PER_INCOMING
    )
      return false;
    counts.set(move.inId, count + 1);
    return true;
  });
}

function rollReason(
  threshold: number,
  atCap: boolean,
  moveCount: number,
  planCount: number,
): string {
  const capNote = atCap ? AT_CAP_ROLL_NOTE : "";
  if (moveCount)
    return `Rolling scores zero improvement and keeps flexibility. Only moves gaining more than ${threshold} net expected points are shown.${capNote}`;
  if (planCount)
    return `No legal single transfer beats the ${threshold}-point net gain threshold. Larger or delayed plans are shown separately; rolling remains the no-hit baseline.${capNote}`;
  return `No evaluated transfer plan beats the ${threshold}-point net gain threshold. Keep the squad and retain flexibility.${capNote}`;
}
