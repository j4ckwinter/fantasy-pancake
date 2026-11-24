import type { ChipName } from "../schemas";
import type { ChipRecommendation, ChipWeek } from "./chip-advice";

export type ValuedRow = {
  chip: ChipName;
  options: ChipWeek[];
  threshold: number;
  expires: boolean;
};

type Assignment = { total: number; weeks: (ChipWeek | null)[] };

const EXPIRING_MIN_GAIN_POINTS = 0.1;

const qualifies = (row: ValuedRow, option: ChipWeek) =>
  row.expires
    ? option.gain >= EXPIRING_MIN_GAIN_POINTS
    : option.gain > row.threshold;

function nextToFreeHit(
  rows: ValuedRow[],
  chosen: (ChipWeek | null)[],
  row: ValuedRow,
  week: number,
): number | undefined {
  if (row.chip !== "freehit") return undefined;
  return chosen.find(
    (option, index) =>
      option &&
      rows[index].chip === "freehit" &&
      Math.abs(option.week - week) === 1,
  )?.week;
}

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
      if (
        qualifies(row, option) &&
        !taken.has(option.week) &&
        !nextToFreeHit(rows, chosen, row, option.week)
      )
        search(index + 1, [...chosen, option], total + option.gain);
    search(index + 1, [...chosen, null], total);
  };
  search(0, [], 0);
  return best.weeks;
}

export function bestOption(options: ChipWeek[]): ChipWeek {
  return options.reduce((best, option) =>
    option.gain > best.gain ? option : best,
  );
}

export function recommendWeeks(rows: ValuedRow[]): ChipRecommendation[] {
  const assigned = bestAssignment(rows);
  const weekOwner = new Map(
    assigned.flatMap((option, index) =>
      option ? [[option.week, rows[index].chip] as const] : [],
    ),
  );
  return rows.map((row, index): ChipRecommendation => {
    const option = assigned[index];
    if (option)
      return {
        kind: "play",
        week: option.week,
        reason: option.gain > row.threshold ? "clears-bar" : "expires",
      };
    const best = bestOption(row.options);
    if (!qualifies(row, best))
      return { kind: "hold", reason: "below-threshold" };
    const takenBy = weekOwner.get(best.week);
    if (takenBy) return { kind: "hold", reason: "week-taken", takenBy };
    const others = assigned.map((other, i) => (i === index ? null : other));
    const freeHitWeek = nextToFreeHit(rows, others, row, best.week);
    return freeHitWeek === undefined
      ? { kind: "hold", reason: "below-threshold" }
      : { kind: "hold", reason: "next-to-free-hit", freeHitWeek };
  });
}
