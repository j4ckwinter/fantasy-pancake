import type { AvailabilityScenario, Data, Settings } from "../schemas";
import type {
  PlanIdentity,
  PlanVariant,
  TransferAction,
  TransferPlan,
} from "./types";
import { freeTransferCap, uncoveredTransfers } from "./transfer-rules";
import {
  AT_CAP_NET_GAIN_THRESHOLD_POINTS,
  NET_GAIN_THRESHOLD_POINTS,
  transferThreshold,
} from "./transfer-threshold";
import { DEFAULT_AVAILABILITY_SCENARIO } from "./scoring";
import {
  CHEAP_CANDIDATES_PER_POSITION,
  STRONG_CANDIDATES_PER_POSITION,
  candidatePool,
} from "./plan-candidates";
import {
  MAX_TRANSFERS_PER_WEEK,
  PLAN_BEAM_WIDTH,
  adjustedValue,
  compareCandidates,
  exchangedPlayers,
  searchPlans,
  WEEK_TRANSFER_CHOICES,
  type PlanCandidate,
  type PlanShape,
  type SearchSpace,
} from "./plan-search";
import { accountPlan } from "./plan-accounting";
import { transferContext, type TransferContext } from "./transfer-preview";

const PLAN_ALTERNATIVES = 3;

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

const PLAN_AHEAD_REASONS = [
  "Only this gameweek's moves need making now. Later weeks are a sketch: rerun the plan each week as news and prices change.",
];

const ALTERNATIVE_RULES: Record<
  Exclude<PlanVariant, "best">,
  {
    applies: (best: PlanCandidate, weeks: number[]) => boolean;
    matches: (candidate: PlanCandidate, weeks: number[]) => boolean;
  }
> = {
  "no-hits": {
    applies: (best) => best.hit > 0,
    matches: (candidate) => candidate.hit === 0,
  },
  "fewer-moves": {
    applies: (best) => best.transfers > 1,
    matches: (candidate) => candidate.transfers === 1,
  },
  "bank-first": {
    applies: (best, weeks) => movesIn(best, weeks[0]),
    matches: (candidate, weeks) => !movesIn(candidate, weeks[0]),
  },
  "move-now": {
    applies: (best, weeks) => !movesIn(best, weeks[0]),
    matches: (candidate, weeks) => movesIn(candidate, weeks[0]),
  },
};

const ALTERNATIVE_ORDER = [
  "no-hits",
  "fewer-moves",
  "bank-first",
  "move-now",
] as const satisfies readonly Exclude<PlanVariant, "best">[];

function transferSet(candidate: PlanCandidate): string {
  const weeks = [...new Set(candidate.actions.map((action) => action.week))];
  return weeks
    .map(
      (week) =>
        `${week}:${exchangedPlayers(candidate.actions.filter((action) => action.week === week))}`,
    )
    .join(" ");
}

function movesIn(candidate: PlanCandidate, week: number | undefined) {
  return candidate.actions.some((action) => action.week === week);
}

function searchSpace(context: TransferContext): SearchSpace {
  const { data, settings, weeks, squad, scores, rules, start } = context;
  const cap = freeTransferCap(data.bootstrap.game_settings);
  return {
    data,
    weeks,
    scores,
    rules,
    start,
    freeTransfers: settings.freeTransfers,
    cap,
    candidates: candidatePool(data, squad, scores),
    margin: (transfers, freeTransfers) =>
      transferThreshold(freeTransfers, cap) *
      (transfers + uncoveredTransfers(transfers, freeTransfers)),
  };
}

function plan(
  context: TransferContext,
  actions: TransferAction[],
  identity: PlanIdentity,
  reasons: string[],
): TransferPlan {
  return { ...accountPlan(context, actions), ...identity, reasons };
}

function shapes(weeks: number[]): Record<TransferPlan["kind"], PlanShape> {
  return {
    "plan-ahead": weeks.map(() => WEEK_TRANSFER_CHOICES),
    "pair-now": weeks.map((_, index) => (index === 0 ? [2] : [0])),
    "roll-then-transfer":
      weeks.length < 2
        ? []
        : weeks.map((_, index) => (index === 1 ? [1] : [0])),
  };
}

export function planTransfers(context: TransferContext): TransferPlan[] {
  const { weeks, settings } = context;
  if (!weeks.length) return [];
  const space = searchSpace(context);
  const holding = context.baseline.reduce(
    (sum, lineup) => sum + lineup.score,
    0,
  );
  const assumptions = planAssumptions(settings);
  const search = (shape: PlanShape) =>
    shape.length
      ? searchPlans(space, shape)
          .filter((candidate) => adjustedValue(candidate) > holding)
          .sort(compareCandidates)
      : [];
  const shapeFor = shapes(weeks);
  const [pair] = search(shapeFor["pair-now"]);
  const [roll] = search(shapeFor["roll-then-transfer"]);
  return [
    ...planAhead(context, search(shapeFor["plan-ahead"]), assumptions),
    ...(pair
      ? [
          plan(context, pair.actions, { kind: "pair-now" }, [
            ...PAIR_REASONS,
            ...assumptions,
          ]),
        ]
      : []),
    ...(roll
      ? [
          plan(context, roll.actions, { kind: "roll-then-transfer" }, [
            ...rollReasons(weeks, space.cap, settings.freeTransfers),
            ...assumptions,
          ]),
        ]
      : []),
  ];
}

function planAhead(
  context: TransferContext,
  ranked: PlanCandidate[],
  assumptions: string[],
): TransferPlan[] {
  const [best] = ranked;
  if (!best) return [];
  const { weeks } = context;
  const chosen = new Set([transferSet(best)]);
  const alternatives: { variant: PlanVariant; candidate: PlanCandidate }[] = [];
  for (const variant of ALTERNATIVE_ORDER) {
    if (alternatives.length >= PLAN_ALTERNATIVES) break;
    const rule = ALTERNATIVE_RULES[variant];
    if (!rule.applies(best, weeks)) continue;
    const candidate = ranked.find(
      (option) =>
        !chosen.has(transferSet(option)) && rule.matches(option, weeks),
    );
    if (!candidate) continue;
    chosen.add(transferSet(candidate));
    alternatives.push({ variant, candidate });
  }
  const reasons = [...PLAN_AHEAD_REASONS, ...assumptions];
  return [{ variant: "best" as const, candidate: best }, ...alternatives].map(
    ({ variant, candidate }) =>
      plan(
        context,
        candidate.actions,
        { kind: "plan-ahead", variant },
        reasons,
      ),
  );
}

export function evaluatePlan(
  data: Data,
  settings: Settings,
  original: TransferPlan,
): TransferPlan {
  return {
    ...original,
    ...accountPlan(transferContext(data, settings), original.actions),
  };
}

function planAssumptions(settings: Settings): string[] {
  return [
    SCENARIO_ASSUMPTION[
      settings.availabilityScenario ?? DEFAULT_AVAILABILITY_SCENARIO
    ],
    `Bounded search: ${STRONG_CANDIDATES_PER_POSITION} strongest and ${CHEAP_CANDIDATES_PER_POSITION} cheapest candidates per position, at most ${MAX_TRANSFERS_PER_WEEK} transfers a week, and the best ${PLAN_BEAM_WIDTH} plans kept each week. It is not exhaustive.`,
    `Each transfer must add more than ${NET_GAIN_THRESHOLD_POINTS} expected points after hits (${AT_CAP_NET_GAIN_THRESHOLD_POINTS} at the free-transfer cap), and each hit must clear that margin again, because the forecast gain of the best-looking move runs optimistic.`,
    "Uses today's purchase and selling prices throughout; confirm outgoing prices and recheck future prices before acting.",
    "Ignores future injury news and price changes. No chips or automatic substitutions are simulated.",
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
