import type { ChipName } from "../schemas";
import type { Lineup, TransferPlan } from "./types";
import {
  chipAvailability,
  type ChipAvailability,
  type ChipWindow,
} from "./chip-availability";
import { chipPath, type ChipPath } from "./chip-paths";
import { bestOption, chooseChips, type ChipOption } from "./chip-weeks";
import { roundScore } from "./round-score";
import type { TransferContext } from "./transfer-preview";

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

function chipWeek(
  chip: ChipName,
  weeks: number[],
  option: ChipOption,
): ChipWeek {
  const played = option.path.find((week) => week.week === option.week)!;
  return {
    week: option.week,
    coveredWeeks:
      chip === "wildcard"
        ? weeks.filter((week) => week >= option.week)
        : [option.week],
    gain: roundScore(option.gain),
    lineup: { ...played.lineup, score: roundScore(played.lineup.score) },
    bench: played.squad
      .filter((player) => !played.lineup.ids.includes(player.id))
      .map((player) => player.id),
  };
}

function valueChips(
  path: ChipPath,
  availability: ChipAvailability[],
): ChipStatus[] {
  const open = availability.flatMap((row) =>
    row.status === "available" ? [row] : [],
  );
  const choices = chooseChips(
    path.evaluate,
    open.map((row) => ({
      chip: row.chip,
      weeks: row.weeks,
      threshold: CHIP_PLAY_THRESHOLD_POINTS[row.chip],
      expires: row.expires,
    })),
  );
  return availability.map((row): ChipStatus => {
    if (row.status !== "available") return row;
    const choice = choices[open.indexOf(row)];
    if (!choice) return { ...row, valuation: { kind: "no-squad" } };
    const options = choice.options.map((option) =>
      chipWeek(row.chip, path.weeks, option),
    );
    const valuation: Valued = {
      kind: "valued",
      threshold: CHIP_PLAY_THRESHOLD_POINTS[row.chip],
      options,
      best: chipWeek(row.chip, path.weeks, bestOption(choice.options)),
      recommendation: choice.recommendation,
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
    chips: valueChips(chipPath(context, plans), availability),
  };
}
