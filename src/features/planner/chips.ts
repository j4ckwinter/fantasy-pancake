import {
  FORECAST_ACCURACY,
  PLANNING_HORIZON_WEEKS,
  type Analysis,
  type ChipAdvice,
  type ChipRecommendation,
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

type Hold = Extract<ChipRecommendation, { kind: "hold" }>;

const showsAsZero = (gain: number) => signedPoints(gain) === signedPoints(0);

function nothingToGain(chip: ChipName, best: ChipWeek): string {
  const span = gameweekRange(best.coveredWeeks);
  return chip === "wildcard"
    ? `Doesn’t beat your recommended plan over ${span}.`
    : `Gains nothing worth playing in ${gameweekRange([best.week])}.`;
}

function holdReason(
  hold: Hold,
  row: Extract<ChipStatus, { status: "available" }>,
  best: ChipWeek,
  bar: string,
): string {
  const quoted = `Best GW${best.week} ${signedPoints(best.gain)}${keptThrough(best)}`;
  switch (hold.reason) {
    case "below-threshold":
      if (showsAsZero(best.gain)) return nothingToGain(row.chip, best);
      return row.expires
        ? `${quoted}, which gains nothing worth playing.`
        : `${quoted}, under ${bar}.`;
    case "week-taken":
      return `${quoted}, but ${chipLabels[hold.takenBy]} gains more that week. One chip per gameweek.`;
    case "next-to-free-hit":
      return `${quoted}, but the other Free Hit is advised for GW${hold.freeHitWeek}. FPL’s data doesn’t say whether back-to-back Free Hits are allowed, so the planner won’t advise them.`;
  }
}

function keptThrough(option: ChipWeek): string {
  const last = option.coveredWeeks.at(-1);
  return option.coveredWeeks.length > 1 ? ` over GW${option.week}–${last}` : "";
}

function wildcardNote(chip: ChipName, best: ChipWeek) {
  const last = best.coveredWeeks.at(-1);
  return chip === "wildcard"
    ? ` Measured against your recommended plan, or holding if none. A Wildcard squad keeps scoring after GW${last}, but that value is unknown, so later weeks look worse than they are.`
    : "";
}

function availableSummary(
  row: Extract<ChipStatus, { status: "available" }>,
): Omit<ChipSummary, "key" | "chip" | "label"> {
  const usable = `Usable ${gameweekRange(row.weeks)}, window ${windowText(row.window.firstWeek, row.window.lastWeek)}`;
  const { valuation } = row;
  const expiry = row.expires ? ` Expires after GW${row.window.lastWeek}.` : "";
  switch (valuation.kind) {
    case "no-squad":
      return {
        badge: "Not valued",
        tone: "warning",
        detail: `${usable}.${expiry} The squad search found no legal squad within your budget and the club limit, so it can’t value this chip.`,
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
            detail:
              recommendation.reason === "expires"
                ? `Expires after GW${row.window.lastWeek}, so holding is worth nothing. Best remaining week: ${signedPoints(played.gain)} in GW${played.week}${keptThrough(played)}.${wildcardNote(row.chip, best)}`
                : `${signedPoints(played.gain)} in GW${played.week}${keptThrough(played)}, clearing ${bar}.${expiry}${wildcardNote(row.chip, best)}`,
            previewWeek: played.week,
          };
        }
        case "hold":
          return {
            badge: "Hold",
            tone: "neutral",
            detail: `${holdReason(recommendation, row, best, bar)}${expiry}${wildcardNote(row.chip, best)}`,
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
  const shared = (chip: ChipName) =>
    advice.chips.filter((row) => row.chip === chip).length > 1;
  return advice.chips.map((row) => {
    const summary = summaryOf(row);
    return row.status === "available" && shared(row.chip)
      ? {
          ...summary,
          label: `${summary.label} · ${windowText(row.window.firstWeek, row.window.lastWeek)}`,
        }
      : summary;
  });
}

export function chipsUnknownText(
  missing: Extract<ChipAdvice, { status: "unknown" }>["missing"],
  savedPlan: boolean,
): string {
  switch (missing) {
    case "played-chips":
      return savedPlan
        ? "This saved plan doesn’t know which chips you’ve played, and FPL couldn’t be reached to check."
        : "FPL didn’t send the chips you’ve played.";
    case "chip-rules":
      return "FPL hasn’t published this season’s chip rules yet.";
  }
}

export const chipsRefreshWarning =
  "Refreshing re-imports your squad, bank and free transfers from FPL, replacing edits, confirmed prices and the free transfers you set.";

export const chipsFromSaveText =
  "Chip status is from when this plan was saved, because FPL couldn’t be reached. Refresh from FPL to update it.";

export const chipHorizonNote = (weeks: number[]) =>
  `Chip advice looks ${PLANNING_HORIZON_WEEKS} gameweeks ahead (${gameweekRange(weeks)}) along your recommended plan, or your current squad if no plan qualifies. A chip’s value outside that horizon is unknown, so “hold” means nothing here clears the bar.`;

export const chipOptimismNote = () =>
  `Big forecast gains run optimistic. Replaying the GW${FORECAST_ACCURACY.firstReplayDeadline}–${FORECAST_ACCURACY.lastReplayDeadline} deadlines, top transfers forecast ${signedPoints(FORECAST_ACCURACY.replayedTopTransferForecastGain)} and realised ${signedPoints(FORECAST_ACCURACY.replayedTopTransferRealisedGain)}. Free Hit and Wildcard pick the best of many squads in the same way.`;

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
