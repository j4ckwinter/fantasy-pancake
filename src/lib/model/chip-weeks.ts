import type { ChipName } from "../schemas";
import type { ChipRecommendation, ChipWeek } from "./chip-advice";

export type ValuedRow = {
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
    const takenBy = row.options
      .filter((candidate) => qualifies(row, candidate))
      .map((candidate) => weekOwner.get(candidate.week))
      .find((owner) => owner !== undefined);
    return takenBy
      ? { kind: "hold", reason: "week-taken", takenBy }
      : { kind: "hold", reason: "below-threshold" };
  });
}
