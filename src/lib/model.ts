import type { Data, Settings } from "./schemas";
import type { Analysis, Move } from "./model/types";
import { validateSquad } from "./model/squad-rules";
import { checkTransfers } from "./model/transfer-legality";
import { upcomingWeeks } from "./model/schedule";
import { planTransfers } from "./model/planning";
import {
  transferContext,
  evaluatePreparedTransfer,
  addAvailabilitySensitivity,
} from "./model/transfer-preview";
import { freeTransferCap } from "./model/transfer-rules";
import { roundScore } from "./model/round-score";

export { evaluateTransfer, previewTransfers } from "./model/transfer-preview";
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
  TRANSFER_HIT_POINTS,
  freeTransferCap,
  nextWeekFreeTransfers,
} from "./model/transfer-rules";

const NET_GAIN_THRESHOLD = 2;
const AT_CAP_NET_GAIN_THRESHOLD = 1;
const SHORTLIST_INCOMING_PLAYERS = 3;
const SHORTLIST_OUTGOING_PER_INCOMING = 3;

export function analyze(data: Data, settings: Settings): Analysis {
  const errors = validateSquad(data, settings);
  if (errors.length) throw new Error(errors.join(" "));
  const weeks = upcomingWeeks(data);
  const atCap =
    settings.freeTransfers >= freeTransferCap(data.bootstrap.game_settings);
  const threshold = atCap ? AT_CAP_NET_GAIN_THRESHOLD : NET_GAIN_THRESHOLD;
  if (!weeks.length)
    return {
      weeks,
      baseline: [],
      moves: [],
      plans: [],
      threshold,
      rollReason:
        "No upcoming gameweeks are available. Recheck when the next season or schedule is published.",
    };
  const context = transferContext(data, settings);
  const { squad, scores, baseline, rules, start } = context;
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
  moves.sort(
    (a, b) =>
      b.gain - a.gain ||
      b.immediateGain - a.immediateGain ||
      a.inId - b.inId ||
      a.outId - b.outId,
  );
  const incomingIds = [...new Set(moves.map((move) => move.inId))].slice(
    0,
    SHORTLIST_INCOMING_PLAYERS,
  );
  const counts = new Map<number, number>();
  const shortlisted = moves.filter((move) => {
    const count = counts.get(move.inId) ?? 0;
    if (
      !incomingIds.includes(move.inId) ||
      count >= SHORTLIST_OUTGOING_PER_INCOMING
    )
      return false;
    counts.set(move.inId, count + 1);
    return true;
  });
  addAvailabilitySensitivity(context, shortlisted);
  const plans = planTransfers(
    data,
    settings,
    weeks,
    squad,
    scores,
    baseline,
    threshold,
  );
  const rollReason = moves.length
    ? `Rolling scores zero improvement and keeps flexibility. Only moves exceeding ${threshold} net score units are shown.${atCap ? " You are at the free-transfer cap, so rolling cannot add another saved transfer." : ""}`
    : plans.length
      ? `No legal single transfer beats the ${threshold}-unit net improvement threshold. Larger or delayed plans are shown separately; rolling remains the no-hit baseline.${atCap ? " You are at the free-transfer cap, so rolling cannot add another saved transfer." : ""}`
      : `No evaluated transfer plan beats the ${threshold}-unit net improvement threshold. Keep the squad and retain flexibility.${atCap ? " You are at the free-transfer cap, so rolling cannot add another saved transfer." : ""}`;
  return {
    weeks,
    baseline: baseline.map((lineup) => ({
      ...lineup,
      score: roundScore(lineup.score),
    })),
    moves: shortlisted,
    plans,
    threshold,
    rollReason,
  };
}
