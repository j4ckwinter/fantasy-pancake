import {
  FORECAST_ACCURACY,
  PLANNING_HORIZON_WEEKS,
  type Analysis,
  type ChipAdvice,
  type ChipStatus,
  type ChipWeek,
} from "@/lib/model";
import type { ChipName } from "@/lib/schemas";
import { expectedPoints, gameweekRange, signedPoints } from "./format";

export const chipLabels: Record<ChipName, string> = {
  wildcard: "Wildcard",
  freehit: "Free Hit",
  bboost: "Bench Boost",
  "3xc": "Triple Captain",
};

export type ChipTone = "success" | "neutral" | "warning";

export type ChipSummary = {
  key: string;
  chip: ChipName;
  label: string;
  badge: string;
  tone: ChipTone;
  detail: string;
  previewWeek: number | null;
};

export type ChipPreview = {
  chip: ChipName;
  label: string;
  option: ChipWeek;
  threshold: number;
};

const windowText = (first: number, last: number) => `GW${first}–${last}`;

export function chipKey(row: ChipStatus): string {
  return row.status === "available"
    ? `${row.chip}-${row.window.firstWeek}`
    : row.chip;
}

function availableSummary(
  row: Extract<ChipStatus, { status: "available" }>,
): Omit<ChipSummary, "key" | "chip" | "label"> {
  const usable = `Usable ${gameweekRange(row.weeks)}, window ${windowText(row.window.firstWeek, row.window.lastWeek)}`;
  const { valuation } = row;
  switch (valuation.kind) {
    case "pending":
      return {
        badge: "Available",
        tone: "neutral",
        detail: `${usable}. Its value needs multi-week planning, which is coming.`,
        previewWeek: null,
      };
    case "valued": {
      const { best, threshold, recommendation } = valuation;
      const bar = `the ${expectedPoints(threshold)} bar`;
      switch (recommendation.kind) {
        case "play": {
          const played = valuation.options.find(
            (option) => option.week === recommendation.week,
          )!;
          return {
            badge: `Play GW${played.week}`,
            tone: "success",
            detail: `${signedPoints(played.gain)} in GW${played.week}, clearing ${bar}.`,
            previewWeek: played.week,
          };
        }
        case "hold":
          return {
            badge: "Hold",
            tone: "neutral",
            detail:
              recommendation.reason === "week-taken"
                ? `Best GW${best.week} ${signedPoints(best.gain)}, but ${chipLabels[recommendation.takenBy]} gains more that week. One chip per gameweek.`
                : `Best GW${best.week} ${signedPoints(best.gain)}, under ${bar}.`,
            previewWeek: best.week,
          };
      }
    }
  }
}

function summaryOf(row: ChipStatus): ChipSummary {
  const base = {
    key: chipKey(row),
    chip: row.chip,
    label: chipLabels[row.chip],
  };
  switch (row.status) {
    case "available":
      return { ...base, ...availableSummary(row) };
    case "used":
      return {
        ...base,
        badge: `Used GW${row.week}`,
        tone: "neutral",
        detail: row.nextWindow
          ? `Another opens GW${row.nextWindow.firstWeek}.`
          : "None left this season.",
        previewWeek: null,
      };
    case "outside-window":
      return {
        ...base,
        badge: "Not open",
        tone: "warning",
        detail: row.nextWindow
          ? `Outside its window. Opens GW${row.nextWindow.firstWeek}.`
          : "Outside its window, with none left this season.",
        previewWeek: null,
      };
  }
}

export function chipSummaries(
  advice: Extract<ChipAdvice, { status: "known" }>,
): ChipSummary[] {
  return advice.chips.map(summaryOf);
}

export const chipsUnknownText: Record<
  Extract<ChipAdvice, { status: "unknown" }>["missing"],
  string
> = {
  "played-chips":
    "This saved plan doesn’t know which chips you’ve played. Refresh from FPL to load them.",
  "chip-rules": "FPL hasn’t published this season’s chip rules yet.",
};

export const chipHorizonNote = (weeks: number[]) =>
  `Chip advice looks ${PLANNING_HORIZON_WEEKS} gameweeks ahead (${gameweekRange(weeks)}) using your current squad. A chip’s value outside that horizon is unknown, so “hold” means nothing here clears the bar.`;

export const chipOptimismNote = () =>
  `Big forecast gains run optimistic. Replaying the GW${FORECAST_ACCURACY.firstReplayDeadline}–${FORECAST_ACCURACY.lastReplayDeadline} deadlines, top transfers forecast ${signedPoints(FORECAST_ACCURACY.replayedTopTransferForecastGain)} and realised ${signedPoints(FORECAST_ACCURACY.replayedTopTransferRealisedGain)}. Free Hit picks the best of many squads in the same way.`;

export function previewedChip(
  result: Pick<Analysis, "chips" | "weeks">,
  key: string | null,
  lineupIndex: number,
): ChipPreview | null {
  if (!key || result.chips.status !== "known") return null;
  const row = result.chips.chips.find(
    (candidate) => chipKey(candidate) === key,
  );
  if (row?.status !== "available" || row.valuation.kind !== "valued")
    return null;
  const week = result.weeks[lineupIndex];
  const option = row.valuation.options.find(
    (candidate) => candidate.week === week,
  );
  return option
    ? {
        chip: row.chip,
        label: chipLabels[row.chip],
        option,
        threshold: row.valuation.threshold,
      }
    : null;
}
