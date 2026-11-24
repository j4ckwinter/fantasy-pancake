import type { ChipName, Player } from "../schemas";
import type { Lineup } from "./types";
import {
  chipAvailability,
  type ChipAvailability,
  type ChipWindow,
} from "./chip-availability";
import { captaincyByWeek } from "./captaincy-preview";
import { bestFreeHitSquad, type FreeHitMarket } from "./free-hit-squad";
import { bestLineup } from "./lineup";
import { roundScore } from "./round-score";
import { isTransferable } from "./transfer-legality";
import type { TransferContext } from "./transfer-preview";

export type ValuedChip = Exclude<ChipName, "wildcard">;

export const CHIP_PLAY_THRESHOLD_POINTS: Record<ValuedChip, number> = {
  freehit: 20,
  bboost: 15,
  "3xc": 8,
};

export type ChipWeek = {
  week: number;
  gain: number;
  lineup: Lineup;
  bench: number[];
};

export type ChipRecommendation =
  | { kind: "play"; week: number; reason: "clears-bar" | "expires" }
  | { kind: "hold"; reason: "below-threshold" }
  | { kind: "hold"; reason: "week-taken"; takenBy: ChipName };

export type ChipValuation =
  | { kind: "pending" }
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

const isValued = (chip: ChipName): chip is ValuedChip => chip !== "wildcard";

function weekIndex(context: TransferContext, week: number) {
  return context.weeks.indexOf(week);
}

function benchOf(squad: Player[], lineup: Lineup) {
  return squad
    .filter((player) => !lineup.ids.includes(player.id))
    .map((player) => player.id);
}

function tripleCaptainWeeks(
  context: TransferContext,
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
      gain: captaincy[index].captain.expectedPoints,
      lineup,
      bench: benchOf(context.squad, lineup),
    };
  });
}

function benchBoostWeeks(
  context: TransferContext,
  weeks: number[],
): ChipWeek[] {
  return weeks.map((week) => {
    const index = weekIndex(context, week);
    const lineup = context.baseline[index];
    const bench = benchOf(context.squad, lineup);
    const gain = bench.reduce(
      (sum, id) => sum + (context.scores[index].get(id) ?? 0),
      0,
    );
    return { week, gain: roundScore(gain), lineup, bench };
  });
}

function freeHitMarket(context: TransferContext): FreeHitMarket {
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

function freeHitWeeks(context: TransferContext, weeks: number[]): ChipWeek[] {
  const market = freeHitMarket(context);
  return weeks.map((week) => {
    const index = weekIndex(context, week);
    const scores = context.scores[index];
    const yours = context.baseline[index];
    const squad = bestFreeHitSquad(context.data, market, scores);
    const lineup = squad && bestLineup(context.data, squad, scores);
    if (!squad || !lineup || lineup.score <= yours.score)
      return {
        week,
        gain: 0,
        lineup: yours,
        bench: benchOf(context.squad, yours),
      };
    return {
      week,
      gain: roundScore(lineup.score - yours.score),
      lineup,
      bench: benchOf(squad, lineup),
    };
  });
}

const VALUE_WEEKS: Record<
  ValuedChip,
  (context: TransferContext, weeks: number[]) => ChipWeek[]
> = {
  "3xc": tripleCaptainWeeks,
  bboost: benchBoostWeeks,
  freehit: freeHitWeeks,
};

function bestOption(options: ChipWeek[]): ChipWeek {
  return options.reduce((best, option) =>
    option.gain > best.gain ? option : best,
  );
}

type ValuedRow = {
  chip: ChipName;
  options: ChipWeek[];
  threshold: number;
  expires: boolean;
};

type Assignment = { total: number; weeks: (ChipWeek | null)[] };

const qualifies = (row: ValuedRow, option: ChipWeek) =>
  row.expires ? option.gain > 0 : option.gain > row.threshold;

function bestAssignment(rows: ValuedRow[]): (ChipWeek | null)[] {
  const best: Assignment = { total: -Infinity, weeks: [] };
  const search = (
    index: number,
    chosen: (ChipWeek | null)[],
    total: number,
  ) => {
    if (index === rows.length) {
      if (total > best.total) Object.assign(best, { total, weeks: chosen });
      return;
    }
    const row = rows[index];
    const taken = new Set(chosen.map((option) => option?.week));
    for (const option of row.options)
      if (qualifies(row, option) && !taken.has(option.week))
        search(index + 1, [...chosen, option], total + option.gain);
    search(index + 1, [...chosen, null], total);
  };
  search(0, [], 0);
  return best.weeks;
}

function assignWeeks(rows: ValuedRow[]): Map<number, ChipRecommendation> {
  const assigned = bestAssignment(rows);
  const weekOwner = new Map(
    assigned.flatMap((option, index) =>
      option ? [[option.week, rows[index].chip] as const] : [],
    ),
  );
  return new Map(
    rows.map((row, index): [number, ChipRecommendation] => {
      const option = assigned[index];
      if (option)
        return [
          index,
          {
            kind: "play",
            week: option.week,
            reason: option.gain > row.threshold ? "clears-bar" : "expires",
          },
        ];
      const takenBy = row.options
        .filter((candidate) => qualifies(row, candidate))
        .map((candidate) => weekOwner.get(candidate.week))
        .find((owner) => owner !== undefined);
      return [
        index,
        takenBy
          ? { kind: "hold", reason: "week-taken", takenBy }
          : { kind: "hold", reason: "below-threshold" },
      ];
    }),
  );
}

function valueChips(
  context: TransferContext,
  availability: ChipAvailability[],
): ChipStatus[] {
  const valued = availability.map((row) =>
    row.status === "available" && isValued(row.chip)
      ? {
          chip: row.chip,
          options: VALUE_WEEKS[row.chip](context, row.weeks),
          threshold: CHIP_PLAY_THRESHOLD_POINTS[row.chip],
          expires: row.expires,
        }
      : null,
  );
  const rows = valued.flatMap((row) => (row ? [row] : []));
  const recommendations = assignWeeks(rows);
  return availability.map((row, index): ChipStatus => {
    if (row.status !== "available") return row;
    const entry = valued[index];
    if (!entry) return { ...row, valuation: { kind: "pending" } };
    const valuation: Valued = {
      kind: "valued",
      threshold: entry.threshold,
      options: entry.options,
      best: bestOption(entry.options),
      recommendation: recommendations.get(rows.indexOf(entry))!,
    };
    return { ...row, valuation };
  });
}

export function adviseChips(context: TransferContext): ChipAdvice {
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
    chips: valueChips(context, availability),
  };
}
