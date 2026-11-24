import type { ChipName, Player } from "../schemas";
import type { Lineup, TransferPlan } from "./types";
import {
  chipAvailability,
  type ChipAvailability,
  type ChipWindow,
} from "./chip-availability";
import { captaincyByWeek } from "./captaincy-preview";
import { bestAffordableSquad, type SquadMarket } from "./affordable-squad";
import { bestLineup } from "./lineup";
import { roundScore } from "./round-score";
import { isTransferable } from "./transfer-legality";
import type { TransferContext } from "./transfer-preview";
import { bestOption, recommendWeeks } from "./chip-weeks";

export const CHIP_PLAY_THRESHOLD_POINTS: Record<ChipName, number> = {
  wildcard: 20,
  freehit: 20,
  bboost: 15,
  "3xc": 8,
};

export type ChipWeek = {
  week: number;
  coveredWeeks: number[];
  gain: number;
  lineup: Lineup;
  bench: number[];
};

export type ChipRecommendation =
  | { kind: "play"; week: number; reason: "clears-bar" | "expires" }
  | { kind: "hold"; reason: "below-threshold" }
  | { kind: "hold"; reason: "week-taken"; takenBy: ChipName }
  | { kind: "hold"; reason: "next-to-free-hit"; freeHitWeek: number };

export type ChipValuation =
  | { kind: "no-squad" }
  | {
      kind: "valued";
      threshold: number;
      options: ChipWeek[];
      best: ChipWeek;
      recommendation: ChipRecommendation;
    };

export type ChipStatus =
  | Exclude<ChipAvailability, { status: "available" }>
  | {
      status: "available";
      chip: ChipName;
      window: ChipWindow;
      weeks: number[];
      expires: boolean;
      valuation: ChipValuation;
    };

export type ChipAdvice =
  | { status: "unknown"; missing: "chip-rules" | "played-chips" }
  | { status: "known"; weeks: number[]; chips: ChipStatus[] };

type Valued = Extract<ChipValuation, { kind: "valued" }>;

type ChipInputs = { context: TransferContext; plans: TransferPlan[] };

function weekIndex(context: TransferContext, week: number) {
  return context.weeks.indexOf(week);
}

function benchOf(squad: Player[], lineup: Lineup) {
  return squad
    .filter((player) => !lineup.ids.includes(player.id))
    .map((player) => player.id);
}

function tripleCaptainWeeks(
  { context }: ChipInputs,
  weeks: number[],
): ChipWeek[] {
  const captaincy = captaincyByWeek(
    context,
    context.baseline.map((lineup) => ({ squad: context.squad, lineup })),
  );
  return weeks.map((week) => {
    const index = weekIndex(context, week);
    const lineup = context.baseline[index];
    return {
      week,
      coveredWeeks: [week],
      gain: captaincy[index].captain.expectedPoints,
      lineup,
      bench: benchOf(context.squad, lineup),
    };
  });
}

function benchBoostWeeks({ context }: ChipInputs, weeks: number[]): ChipWeek[] {
  return weeks.map((week) => {
    const index = weekIndex(context, week);
    const lineup = context.baseline[index];
    const bench = benchOf(context.squad, lineup);
    const gain = bench.reduce(
      (sum, id) => sum + (context.scores[index].get(id) ?? 0),
      0,
    );
    return {
      week,
      coveredWeeks: [week],
      gain: roundScore(gain),
      lineup,
      bench,
    };
  });
}

function rebuildMarket(context: TransferContext): SquadMarket {
  const { data, settings } = context;
  const selling = new Map(
    settings.squad.map((pick) => [pick.id, pick.sellingPrice]),
  );
  const prices = new Map(
    data.bootstrap.elements.flatMap((player): [number, number][] => {
      const owned = selling.get(player.id);
      if (owned !== undefined) return [[player.id, owned]];
      return isTransferable(player) ? [[player.id, player.now_cost]] : [];
    }),
  );
  const budget =
    settings.bank +
    settings.squad.reduce((sum, pick) => sum + pick.sellingPrice, 0);
  return { players: data.bootstrap.elements, prices, budget };
}

function freeHitWeeks({ context }: ChipInputs, weeks: number[]): ChipWeek[] {
  const market = rebuildMarket(context);
  return weeks.flatMap((week): ChipWeek[] => {
    const index = weekIndex(context, week);
    const scores = context.scores[index];
    const yours = context.baseline[index];
    const squad = bestAffordableSquad(context.data, market, [scores]);
    if (!squad) return [];
    const lineup = bestLineup(context.data, squad, scores);
    if (lineup.score <= yours.score)
      return [
        {
          week,
          coveredWeeks: [week],
          gain: 0,
          lineup: yours,
          bench: benchOf(context.squad, yours),
        },
      ];
    return [
      {
        week,
        coveredWeeks: [week],
        gain: roundScore(lineup.score - yours.score),
        lineup,
        bench: benchOf(squad, lineup),
      },
    ];
  });
}

function plannedPoints({ context, plans }: ChipInputs, from: number) {
  const plan = plans.find(
    (candidate) =>
      candidate.kind === "plan-ahead" && candidate.variant === "best",
  );
  return context.weeks
    .slice(from)
    .reduce(
      (sum, _, offset) =>
        sum +
        (plan
          ? plan.weeks[from + offset].score - plan.weeks[from + offset].hit
          : context.baseline[from + offset].score),
      0,
    );
}

function wildcardWeeks(inputs: ChipInputs, weeks: number[]): ChipWeek[] {
  const { context } = inputs;
  const market = rebuildMarket(context);
  return weeks.flatMap((week): ChipWeek[] => {
    const index = weekIndex(context, week);
    const kept = context.scores.slice(index);
    const squad = bestAffordableSquad(context.data, market, kept);
    if (!squad) return [];
    const lineups = kept.map((scores) =>
      bestLineup(context.data, squad, scores),
    );
    const rebuilt = lineups.reduce((sum, lineup) => sum + lineup.score, 0);
    return [
      {
        week,
        coveredWeeks: context.weeks.slice(index),
        gain: roundScore(rebuilt - plannedPoints(inputs, index)),
        lineup: lineups[0],
        bench: benchOf(squad, lineups[0]),
      },
    ];
  });
}

const VALUE_WEEKS: Record<
  ChipName,
  (inputs: ChipInputs, weeks: number[]) => ChipWeek[]
> = {
  wildcard: wildcardWeeks,
  "3xc": tripleCaptainWeeks,
  bboost: benchBoostWeeks,
  freehit: freeHitWeeks,
};

function valueChips(
  inputs: ChipInputs,
  availability: ChipAvailability[],
): ChipStatus[] {
  const valued = availability.map((row) =>
    row.status === "available"
      ? {
          chip: row.chip,
          options: VALUE_WEEKS[row.chip](inputs, row.weeks),
          threshold: CHIP_PLAY_THRESHOLD_POINTS[row.chip],
          expires: row.expires,
        }
      : null,
  );
  const rows = valued.flatMap((row) => (row?.options.length ? [row] : []));
  const recommendations = recommendWeeks(rows);
  return availability.map((row, index): ChipStatus => {
    if (row.status !== "available") return row;
    const entry = valued[index];
    if (!entry?.options.length)
      return { ...row, valuation: { kind: "no-squad" } };
    const valuation: Valued = {
      kind: "valued",
      threshold: entry.threshold,
      options: entry.options,
      best: bestOption(entry.options),
      recommendation: recommendations[rows.indexOf(entry)],
    };
    return { ...row, valuation };
  });
}

export function adviseChips(
  context: TransferContext,
  plans: TransferPlan[],
): ChipAdvice {
  const { data, settings } = context;
  if (!data.bootstrap.chips)
    return { status: "unknown", missing: "chip-rules" };
  if (!settings.chipsPlayed)
    return { status: "unknown", missing: "played-chips" };
  const availability = chipAvailability(
    data.bootstrap.chips,
    settings.chipsPlayed,
    context.weeks,
  );
  return {
    status: "known",
    weeks: context.weeks,
    chips: valueChips({ context, plans }, availability),
  };
}
