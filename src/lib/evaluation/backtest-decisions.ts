import type { Data, Settings } from "../schemas";
import { bestLineup, netGainThreshold } from "../model";
import {
  checkTransfers,
  startingState,
  transferRules,
} from "../model/transfer-legality";
import type { Player } from "../schemas";

export type WeeklyScores = readonly ReadonlyMap<number, number>[];
export type Swap = { outId: number; inId: number };
export type ActualPoints = (playerId: number, week: number) => number;

export const DECISION_POLICIES = [
  "model",
  "seasonPoints",
  "laggedPoints",
] as const;
export type DecisionPolicy = (typeof DECISION_POLICIES)[number];

export type SquadDecision = {
  deadline: number;
  squad: number;
  modelRecommends: boolean;
  modelPredictedGain: number;
  realisedGain: Record<DecisionPolicy, number>;
};

function horizonScore(
  data: Data,
  squad: Player[],
  scores: WeeklyScores,
): number {
  return scores.reduce(
    (sum, values) => sum + bestLineup(data, squad, values).score,
    0,
  );
}

export function bestSingleTransfer(
  data: Data,
  settings: Settings,
  scores: WeeklyScores,
): { swap: Swap; gain: number } | null {
  const rules = transferRules(data, settings);
  const squad = settings.squad.map((pick) => rules.byId.get(pick.id)!);
  const start = startingState(settings, squad);
  const baseline = horizonScore(data, squad, scores);
  let best: { swap: Swap; gain: number } | null = null;
  for (const outgoing of squad) {
    for (const incoming of data.bootstrap.elements) {
      if (incoming.element_type !== outgoing.element_type) continue;
      const swap = { outId: outgoing.id, inId: incoming.id };
      const check = checkTransfers(rules, start, [swap]);
      if (!check.legal) continue;
      const gain = horizonScore(data, check.state.squad, scores) - baseline;
      if (
        !best ||
        gain > best.gain ||
        (gain === best.gain &&
          (swap.inId < best.swap.inId ||
            (swap.inId === best.swap.inId && swap.outId < best.swap.outId)))
      )
        best = { swap, gain };
    }
  }
  return best;
}

export function realisedPoints(
  data: Data,
  squad: Player[],
  weeks: readonly number[],
  selector: WeeklyScores,
  actual: ActualPoints,
): number {
  return weeks.reduce((sum, week, index) => {
    const lineup = bestLineup(data, squad, selector[index]);
    return (
      sum +
      lineup.ids.reduce((points, id) => points + actual(id, week), 0) +
      actual(lineup.captain, week)
    );
  }, 0);
}

export function decideForSquad(
  data: Data,
  settings: Settings,
  weeks: readonly number[],
  policyScores: Record<DecisionPolicy, WeeklyScores>,
  actual: ActualPoints,
): Omit<SquadDecision, "deadline" | "squad"> {
  const byId = new Map(
    data.bootstrap.elements.map((player) => [player.id, player]),
  );
  const squad = settings.squad.map((pick) => byId.get(pick.id)!);
  const selector = policyScores.model;
  const held = realisedPoints(data, squad, weeks, selector, actual);
  const gainFrom = (swap: Swap | undefined) =>
    swap
      ? realisedPoints(
          data,
          squad.map((player) =>
            player.id === swap.outId ? byId.get(swap.inId)! : player,
          ),
          weeks,
          selector,
          actual,
        ) - held
      : 0;
  const choices = Object.fromEntries(
    DECISION_POLICIES.map((policy) => [
      policy,
      bestSingleTransfer(data, settings, policyScores[policy]),
    ]),
  ) as Record<DecisionPolicy, ReturnType<typeof bestSingleTransfer>>;
  const modelGain = choices.model?.gain ?? 0;
  return {
    modelRecommends: modelGain > netGainThreshold(data, settings),
    modelPredictedGain: modelGain,
    realisedGain: Object.fromEntries(
      DECISION_POLICIES.map((policy) => [
        policy,
        gainFrom(choices[policy]?.swap),
      ]),
    ) as Record<DecisionPolicy, number>,
  };
}
