import type { AvailabilityScenario, Data, Player, Settings } from "../schemas";
import type { Lineup, Move, TransferAction } from "./types";
import { validateSquad } from "./squad-rules";
import {
  applyTransfers,
  startingState,
  transferRules,
} from "./transfer-legality";
import { fixturesFor, upcomingWeeks } from "./schedule";
import { DEFAULT_AVAILABILITY_SCENARIO, weeklyScores } from "./scoring";
import { bestLineup } from "./lineup";
import { roundScore } from "./round-score";
import { transferHit } from "./transfer-rules";
import { transferReasons } from "./transfer-reasons";
import { playerRisks } from "./player-risks";

const AVAILABILITY_SENSITIVE_GAIN_DIFFERENCE = 1;
const ALTERNATE_SCENARIO: Record<AvailabilityScenario, AvailabilityScenario> = {
  persistent: "recover-next-week",
  "recover-next-week": "persistent",
};

export function transferContext(data: Data, settings: Settings) {
  const errors = validateSquad(data, settings);
  if (errors.length) throw new Error(errors.join(" "));
  const weeks = upcomingWeeks(data);
  const rules = transferRules(data, settings);
  const { byId } = rules;
  const squad = settings.squad.map((pick) => byId.get(pick.id)!);
  const scores = weeklyScores(data, weeks, settings.availabilityScenario);
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

export type TransferContext = ReturnType<typeof transferContext>;

export type PreviewedWeek = { squad: Player[]; lineup: Lineup };

export function previewWeeks(
  context: TransferContext,
  actions: TransferAction[],
): PreviewedWeek[] {
  const { data, weeks, scores, rules } = context;
  if (actions.some((action) => !weeks.includes(action.week)))
    throw new Error("Choose a gameweek within the forecast horizon.");
  let state = context.start;
  return weeks.map((week, index) => {
    state = applyTransfers(
      rules,
      state,
      actions.filter((action) => action.week === week),
    );
    return {
      squad: state.squad,
      lineup: bestLineup(data, state.squad, scores[index]),
    };
  });
}

export function previewTransfers(
  data: Data,
  settings: Settings,
  actions: TransferAction[],
): Lineup[] {
  return previewWeeks(transferContext(data, settings), actions).map(
    ({ lineup }) => ({ ...lineup, score: roundScore(lineup.score) }),
  );
}

function totalScore(lineups: Lineup[]): number {
  return lineups.reduce((sum, lineup) => sum + lineup.score, 0);
}

export function evaluatePreparedTransfer(
  context: TransferContext,
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
  const grossGain = totalScore(lineups) - totalScore(baseline);
  const hit = transferHit(1, settings.freeTransfers);
  const scenario =
    settings.availabilityScenario ?? DEFAULT_AVAILABILITY_SCENARIO;
  const move: Move = {
    outId,
    inId,
    cost: incoming.now_cost,
    remainingBank,
    hit,
    gain: roundScore(grossGain - hit),
    immediateGain: roundScore(lineups[0].score - baseline[0].score - hit),
    grossGain: roundScore(grossGain),
    reasons: transferReasons(
      data,
      scenario,
      outgoing,
      incoming,
      grossGain,
      weeks.length,
    ),
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

export function withAvailabilitySensitivity(
  context: TransferContext,
  moves: Move[],
): Move[] {
  const { data, settings, weeks, squad, byId } = context;
  const selected =
    settings.availabilityScenario ?? DEFAULT_AVAILABILITY_SCENARIO;
  const scores = weeklyScores(data, weeks, ALTERNATE_SCENARIO[selected]);
  const horizonTotal = (players: Player[]) =>
    scores.reduce(
      (sum, values) => sum + bestLineup(data, players, values).score,
      0,
    );
  const baseline = horizonTotal(squad);
  return moves.map((move) => {
    const changed = squad.map((player) =>
      player.id === move.outId ? byId.get(move.inId)! : player,
    );
    const alternateGain = roundScore(
      horizonTotal(changed) - baseline - move.hit,
    );
    const gainPersistent =
      selected === "persistent" ? move.gain : alternateGain;
    const gainRecovery =
      selected === "recover-next-week" ? move.gain : alternateGain;
    const sensitive =
      Math.abs(gainPersistent - gainRecovery) >=
      AVAILABILITY_SENSITIVE_GAIN_DIFFERENCE;
    return {
      ...move,
      risks: sensitive
        ? [
            ...move.risks,
            `Availability-sensitive: net gain is ${gainPersistent} with persistent availability and ${gainRecovery} if flagged players recover from week two. These are scenarios, not confidence bounds.`,
          ]
        : move.risks,
      gainPersistent,
      gainRecovery,
    };
  });
}

export function evaluateTransfer(
  data: Data,
  settings: Settings,
  outId: number,
  inId: number,
): { move: Move; lineups: Lineup[] } {
  const context = transferContext(data, settings);
  const { move, lineups } = evaluatePreparedTransfer(context, outId, inId);
  const [sensitiveMove] = withAvailabilitySensitivity(context, [move]);
  return { move: sensitiveMove, lineups };
}
