import type { AvailabilityScenario, Data, Settings } from "../schemas";
import type { Lineup, Move, TransferAction } from "./types";
import { validateSquad } from "./squad-rules";
import {
  applyTransfers,
  startingState,
  transferRules,
} from "./transfer-legality";
import { fixturesFor, upcomingWeeks } from "./schedule";
import {
  DEFAULT_AVAILABILITY_SCENARIO,
  availability,
  expectedMinutes,
  playerRisks,
  scorePlayer,
} from "./scoring";
import { bestLineup } from "./lineup";
import { roundScore } from "./round-score";
import { transferHit } from "./transfer-rules";

const AVAILABILITY_SENSITIVE_GAIN_DIFFERENCE = 1;
const ALTERNATE_SCENARIO: Record<AvailabilityScenario, AvailabilityScenario> = {
  persistent: "recover-next-week",
  "recover-next-week": "persistent",
};
const KEEP_SCORE_SCENARIO_LABEL: Record<AvailabilityScenario, string> = {
  persistent: "persistent absence",
  "recover-next-week": "recovery from the second week",
};

export function transferContext(data: Data, settings: Settings) {
  const errors = validateSquad(data, settings);
  if (errors.length) throw new Error(errors.join(" "));
  const weeks = upcomingWeeks(data);
  const rules = transferRules(data, settings);
  const { byId } = rules;
  const squad = settings.squad.map((pick) => byId.get(pick.id)!);
  const scores = weeks.map(
    (week) =>
      new Map(
        data.bootstrap.elements.map((player) => [
          player.id,
          scorePlayer(data, player, week, settings.availabilityScenario),
        ]),
      ),
  );
  const baseline = scores.map((values) => bestLineup(data, squad, values));
  const start = startingState(settings, squad);
  return {
    data,
    settings,
    weeks,
    byId,
    squad,
    scores,
    baseline,
    rules,
    start,
  };
}

type Context = ReturnType<typeof transferContext>;

export function previewTransfers(
  data: Data,
  settings: Settings,
  actions: TransferAction[],
): Lineup[] {
  const context = transferContext(data, settings);
  const { weeks, scores, rules } = context;
  if (actions.some((action) => !weeks.includes(action.week)))
    throw new Error("Choose a gameweek within the forecast horizon.");
  let state = context.start;
  return weeks.map((week, index) => {
    state = applyTransfers(
      rules,
      state,
      actions.filter((action) => action.week === week),
    );
    const lineup = bestLineup(data, state.squad, scores[index]);
    return { ...lineup, score: roundScore(lineup.score) };
  });
}

export function evaluatePreparedTransfer(
  context: Context,
  outId: number,
  inId: number,
): { move: Move; lineups: Lineup[] } {
  const { data, settings, weeks, byId, scores, baseline } = context;
  if (!weeks.length) throw new Error("No upcoming gameweeks are available.");
  const { squad: changed, bank: remainingBank } = applyTransfers(
    context.rules,
    context.start,
    [{ outId, inId }],
  );
  const outgoing = byId.get(outId)!;
  const incoming = byId.get(inId)!;
  const lineups = scores.map((values) => bestLineup(data, changed, values));
  const baselineTotal = baseline.reduce((sum, lineup) => sum + lineup.score, 0);
  const grossGain =
    lineups.reduce((sum, lineup) => sum + lineup.score, 0) - baselineTotal;
  const hit = transferHit(1, settings.freeTransfers);
  const gain = grossGain - hit;
  const reasons = [
    `Changes the optimised starting XI and captain total by ${roundScore(grossGain)} score units across ${weeks.length} gameweeks before the hit.`,
    `${Math.round(expectedMinutes(data, incoming))} estimated minutes per match from recent history where available, blended with season usage; venue and opponent strengths adjust attacking and clean-sheet scores.`,
  ];
  if (incoming.penalties_order === 1)
    reasons.push(
      "Listed first for penalties; this role is already reflected in underlying attacking data, so receives no extra bonus.",
    );
  if (
    incoming.corners_and_indirect_freekicks_order === 1 ||
    incoming.direct_freekicks_order === 1
  )
    reasons.push(
      "Listed first for a set-piece duty; role context, not an additional scoring bonus.",
    );
  if (availability(outgoing) < 1)
    reasons.push(
      `${outgoing.web_name}'s availability affects the keep score under the selected ${KEEP_SCORE_SCENARIO_LABEL[settings.availabilityScenario ?? DEFAULT_AVAILABILITY_SCENARIO]} scenario; no return date is inferred.`,
    );
  const move: Move = {
    outId,
    inId,
    cost: incoming.now_cost,
    remainingBank,
    hit,
    gain: roundScore(gain),
    immediateGain: roundScore(lineups[0].score - baseline[0].score - hit),
    grossGain: roundScore(grossGain),
    reasons,
    risks: playerRisks(data, incoming, settings.availabilityScenario),
    fixtures: fixturesFor(data, incoming, weeks),
  };
  return {
    move,
    lineups: lineups.map((lineup) => ({
      ...lineup,
      score: roundScore(lineup.score),
    })),
  };
}

export function addAvailabilitySensitivity(
  context: Context,
  moves: Move[],
): void {
  const { data, settings, weeks, squad, byId } = context;
  const selected =
    settings.availabilityScenario ?? DEFAULT_AVAILABILITY_SCENARIO;
  const alternate = ALTERNATE_SCENARIO[selected];
  const scores = weeks.map(
    (week) =>
      new Map(
        data.bootstrap.elements.map((player) => [
          player.id,
          scorePlayer(data, player, week, alternate),
        ]),
      ),
  );
  const baseline = scores.reduce(
    (sum, values) => sum + bestLineup(data, squad, values).score,
    0,
  );
  for (const move of moves) {
    const changed = squad.map((player) =>
      player.id === move.outId ? byId.get(move.inId)! : player,
    );
    const gain = roundScore(
      scores.reduce(
        (sum, values) => sum + bestLineup(data, changed, values).score,
        0,
      ) -
        baseline -
        move.hit,
    );
    move.gainPersistent = selected === "persistent" ? move.gain : gain;
    move.gainRecovery = selected === "recover-next-week" ? move.gain : gain;
    if (
      Math.abs(move.gainPersistent - move.gainRecovery) >=
      AVAILABILITY_SENSITIVE_GAIN_DIFFERENCE
    )
      move.risks.push(
        `Availability-sensitive: net gain is ${move.gainPersistent} with persistent availability and ${move.gainRecovery} if flagged players recover from week two. These are scenarios, not confidence bounds.`,
      );
  }
}

export function evaluateTransfer(
  data: Data,
  settings: Settings,
  outId: number,
  inId: number,
): { move: Move; lineups: Lineup[] } {
  const context = transferContext(data, settings);
  const result = evaluatePreparedTransfer(context, outId, inId);
  addAvailabilitySensitivity(context, [result.move]);
  return result;
}
