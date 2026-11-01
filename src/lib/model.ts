import type { Data, Settings } from "./schemas";
import type { Analysis, Move } from "./model/types";
import { excessClubIds, validateSquad } from "./model/squad-rules";
import { upcomingWeeks } from "./model/schedule";
import { planTransfers } from "./model/planning";
import {
  transferContext,
  evaluatePreparedTransfer,
  addAvailabilitySensitivity,
} from "./model/transfer-preview";

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

const round = (value: number) => Math.round(value * 100) / 100;

export function analyze(data: Data, settings: Settings): Analysis {
  const errors = validateSquad(data, settings);
  if (errors.length) throw new Error(errors.join(" "));
  const weeks = upcomingWeeks(data);
  const atCap =
    settings.freeTransfers >=
    1 + data.bootstrap.game_settings.max_extra_free_transfers;
  const threshold = atCap ? 1 : 2;
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
  const { byId, squad, scores, baseline } = context;
  const owned = new Set(squad.map((player) => player.id));
  const moves: Move[] = [];
  for (const pick of settings.squad) {
    if (settings.lockedPlayerIds?.includes(pick.id)) continue;
    const outgoing = byId.get(pick.id)!;
    for (const incoming of data.bootstrap.elements) {
      if (
        owned.has(incoming.id) ||
        incoming.element_type !== outgoing.element_type ||
        !incoming.can_select ||
        !incoming.can_transact ||
        settings.bank + pick.sellingPrice < incoming.now_cost
      )
        continue;
      const changed = squad.map((player) =>
        player.id === outgoing.id ? incoming : player,
      );
      if (
        excessClubIds(changed, data.bootstrap.game_settings.squad_team_limit)
          .length
      )
        continue;
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
  const incomingIds = [...new Set(moves.map((move) => move.inId))].slice(0, 3);
  const counts = new Map<number, number>();
  const shortlisted = moves.filter((move) => {
    const count = counts.get(move.inId) ?? 0;
    if (!incomingIds.includes(move.inId) || count >= 3) return false;
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
      score: round(lineup.score),
    })),
    moves: shortlisted,
    plans,
    threshold,
    rollReason,
  };
}
