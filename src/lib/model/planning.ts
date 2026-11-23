import type { AvailabilityScenario, Data, Player, Settings } from "../schemas";
import type { Lineup, TransferAction, TransferPlan } from "./types";
import { bestLineup } from "./lineup";
import {
  checkTransfers,
  isTransferable,
  startingState,
  transferRules,
  type SquadState,
  type TransferRules,
} from "./transfer-legality";
import { roundScore } from "./round-score";
import {
  freeTransferCap,
  freeTransfersLeft,
  nextWeekFreeTransfers,
  transferHit,
} from "./transfer-rules";
import { DEFAULT_AVAILABILITY_SCENARIO } from "./scoring";
import { positionOf, type Position } from "./position";

const STRONG_CANDIDATES_PER_POSITION = 4;
const CHEAP_CANDIDATES_PER_POSITION = 2;
const SCENARIO_ASSUMPTION: Record<AvailabilityScenario, string> = {
  persistent:
    "Assumes current availability persists; short absences could make this plan less attractive.",
  "recover-next-week":
    "Assumes injured, suspended and doubtful players recover from week two; this is a scenario, not a predicted return date.",
};

const PAIR_REASONS = [
  "Two simultaneous transfers use the combined sale proceeds; a cheaper replacement can fund the other move.",
  "Free transfers shown are those left immediately after the two moves, before next week's accrual.",
];

type WeeklyScores = ReadonlyMap<number, number>[];

type PlanSearch = {
  weeks: number[];
  squad: Player[];
  candidates: Record<Position, Player[]>;
  rules: TransferRules;
  start: SquadState;
  gains: (changed: Player[]) => number[];
};

type Swap = Pick<TransferAction, "outId" | "inId">;

export function planTransfers(
  data: Data,
  settings: Settings,
  weeks: number[],
  squad: Player[],
  scores: WeeklyScores,
  baseline: Lineup[],
  threshold: number,
): TransferPlan[] {
  if (!weeks.length) return [];
  const search: PlanSearch = {
    weeks,
    squad,
    candidates: candidatePool(data, squad, scores),
    rules: transferRules(data, settings),
    start: startingState(settings, squad),
    gains: lineupGains(data, scores, baseline),
  };
  const assumptions = planAssumptions(settings);
  const cap = freeTransferCap(data.bootstrap.game_settings);
  return bestPlanPerKind(
    [
      ...rollPlans(search, settings.freeTransfers, cap, assumptions),
      ...pairPlans(search, settings.freeTransfers, assumptions),
    ],
    threshold,
  );
}

function candidatePool(
  data: Data,
  squad: Player[],
  scores: WeeklyScores,
): Record<Position, Player[]> {
  const owned = new Set(squad.map((player) => player.id));
  const horizonScore = (player: Player) =>
    scores.reduce((sum, week) => sum + (week.get(player.id) ?? 0), 0);
  const forPosition = (position: Position) => {
    const eligible = data.bootstrap.elements.filter(
      (player) =>
        player.element_type === position &&
        !owned.has(player.id) &&
        isTransferable(player),
    );
    const best = [...eligible]
      .sort((a, b) => horizonScore(b) - horizonScore(a) || a.id - b.id)
      .slice(0, STRONG_CANDIDATES_PER_POSITION);
    const cheap = [...eligible]
      .sort(
        (a, b) =>
          a.now_cost - b.now_cost ||
          horizonScore(b) - horizonScore(a) ||
          a.id - b.id,
      )
      .slice(0, CHEAP_CANDIDATES_PER_POSITION);
    return [...new Map([...best, ...cheap].map((p) => [p.id, p])).values()];
  };
  return {
    1: forPosition(1),
    2: forPosition(2),
    3: forPosition(3),
    4: forPosition(4),
  };
}

function lineupGains(
  data: Data,
  scores: WeeklyScores,
  baseline: Lineup[],
): (changed: Player[]) => number[] {
  const cache = new Map<string, number[]>();
  return (changed) => {
    const key = changed
      .map((player) => player.id)
      .sort((a, b) => a - b)
      .join(",");
    const cached = cache.get(key);
    if (cached) return cached;
    const values = scores.map(
      (week, index) =>
        bestLineup(data, changed, week).score - baseline[index].score,
    );
    cache.set(key, values);
    return values;
  };
}

function singleSwaps(search: PlanSearch): Swap[] {
  return search.squad.flatMap((outgoing) =>
    search.candidates[positionOf(outgoing)].map((incoming) => ({
      outId: outgoing.id,
      inId: incoming.id,
    })),
  );
}

function isMirrorAssignment(
  search: PlanSearch,
  first: Swap,
  second: Swap,
): boolean {
  const firstOut = search.rules.byId.get(first.outId)!;
  const secondOut = search.rules.byId.get(second.outId)!;
  return (
    firstOut.element_type === secondOut.element_type && first.inId > second.inId
  );
}

function swapPairs(search: PlanSearch): [Swap, Swap][] {
  const singles = singleSwaps(search);
  const squadIndex = new Map(
    search.squad.map((player, index) => [player.id, index]),
  );
  return singles.flatMap((first) =>
    singles
      .filter(
        (second) =>
          squadIndex.get(second.outId)! > squadIndex.get(first.outId)! &&
          first.inId !== second.inId &&
          !isMirrorAssignment(search, first, second),
      )
      .map((second): [Swap, Swap] => [first, second]),
  );
}

function rollPlans(
  search: PlanSearch,
  freeTransfers: number,
  cap: number,
  assumptions: string[],
): TransferPlan[] {
  const { weeks } = search;
  if (weeks.length < 2) return [];
  const deferredFreeTransfers = nextWeekFreeTransfers(freeTransfers, cap);
  return singleSwaps(search).flatMap((swap) => {
    const check = checkTransfers(search.rules, search.start, [swap]);
    if (!check.legal) return [];
    const laterGain = search
      .gains(check.state.squad)
      .slice(1)
      .reduce((sum, value) => sum + value, 0);
    return [
      {
        kind: "roll-then-transfer",
        actions: [{ week: weeks[1], ...swap }],
        gain: roundScore(laterGain),
        hit: 0,
        remainingBank: check.state.bank,
        freeTransfersAfterPlan: freeTransfersLeft(1, deferredFreeTransfers),
        reasons: [...rollReasons(weeks, cap, freeTransfers), ...assumptions],
      },
    ];
  });
}

function pairPlans(
  search: PlanSearch,
  freeTransfers: number,
  assumptions: string[],
): TransferPlan[] {
  const hit = transferHit(2, freeTransfers);
  return swapPairs(search).flatMap((swaps) => {
    const check = checkTransfers(search.rules, search.start, swaps);
    if (!check.legal) return [];
    const totalGain = search
      .gains(check.state.squad)
      .reduce((sum, value) => sum + value, 0);
    return [
      {
        kind: "pair-now",
        actions: swaps.map((swap) => ({ week: search.weeks[0], ...swap })),
        gain: roundScore(totalGain - hit),
        hit,
        remainingBank: check.state.bank,
        freeTransfersAfterPlan: freeTransfersLeft(2, freeTransfers),
        reasons: [...PAIR_REASONS, ...assumptions],
      },
    ];
  });
}

function bestPlanPerKind(
  plans: TransferPlan[],
  threshold: number,
): TransferPlan[] {
  const planKey = (plan: TransferPlan) =>
    plan.actions.map((action) => `${action.outId}:${action.inId}`).join(",");
  const best = new Map<TransferPlan["kind"], TransferPlan>();
  for (const plan of plans) {
    if (plan.gain <= threshold) continue;
    const previous = best.get(plan.kind);
    if (
      !previous ||
      plan.gain > previous.gain ||
      (plan.gain === previous.gain && planKey(plan) < planKey(previous))
    )
      best.set(plan.kind, plan);
  }
  return [...best.values()].sort(
    (a, b) => b.gain - a.gain || a.kind.localeCompare(b.kind),
  );
}

function planAssumptions(settings: Settings): string[] {
  return [
    SCENARIO_ASSUMPTION[
      settings.availabilityScenario ?? DEFAULT_AVAILABILITY_SCENARIO
    ],
    "Bounded search: four strongest and two cheapest candidates per position; this is not an exhaustive transfer plan.",
    "Uses today's purchase and selling prices throughout; confirm outgoing prices and recheck future prices before acting.",
    "No chips, further transfers, automatic substitutions or changing injury news are simulated.",
  ];
}

function rollReasons(
  weeks: number[],
  cap: number,
  freeTransfers: number,
): string[] {
  return [
    freeTransfers >= cap
      ? `Keep your squad in GW${weeks[0]}, then move in GW${weeks[1]}. You already hold the ${cap}-transfer cap, so rolling does not add a free transfer.`
      : `Keep your squad in GW${weeks[0]}, accrue one free transfer up to the ${cap}-transfer cap, then move in GW${weeks[1]}.`,
    "Gain compares the remaining horizon with keeping today's squad; the first gameweek contributes no change.",
  ];
}
