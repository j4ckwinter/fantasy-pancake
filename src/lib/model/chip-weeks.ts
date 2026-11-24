import type { ChipName } from "../schemas";
import type { ChipRecommendation } from "./chip-advice";
import type { ChipPlay, PathValue, PathWeek } from "./chip-paths";

export type ChipRow = {
  chip: ChipName;
  weeks: number[];
  threshold: number;
  expires: boolean;
};

export type ChipOption = { week: number; gain: number; path: PathWeek[] };

export type ChipChoice = {
  recommendation: ChipRecommendation;
  options: ChipOption[];
};

type Evaluate = (plays: readonly ChipPlay[]) => PathValue | null;

type Assignment = (number | null)[];

const EXPIRING_MIN_GAIN_POINTS = 0.1;

const qualifies = (row: ChipRow, gain: number) =>
  row.expires ? gain >= EXPIRING_MIN_GAIN_POINTS : gain > row.threshold;

function playsOf(rows: ChipRow[], assignment: Assignment): ChipPlay[] {
  return assignment.flatMap((week, index) =>
    week === null ? [] : [{ chip: rows[index].chip, week }],
  );
}

function freeHitBeside(
  rows: ChipRow[],
  assignment: Assignment,
  row: number,
  week: number,
): number | undefined {
  if (rows[row].chip !== "freehit") return undefined;
  return (
    assignment.find(
      (other, index) =>
        index !== row &&
        other !== null &&
        rows[index].chip === "freehit" &&
        Math.abs(other - week) === 1,
    ) ?? undefined
  );
}

function without(assignment: Assignment, row: number): Assignment {
  return assignment.map((week, index) => (index === row ? null : week));
}

function gainOf(evaluate: Evaluate, rows: ChipRow[], assignment: Assignment) {
  return evaluate(playsOf(rows, assignment))?.gain ?? null;
}

function marginal(
  evaluate: Evaluate,
  rows: ChipRow[],
  assignment: Assignment,
  row: number,
): number | null {
  const withRow = gainOf(evaluate, rows, assignment);
  const withoutRow = gainOf(evaluate, rows, without(assignment, row));
  return withRow === null || withoutRow === null ? null : withRow - withoutRow;
}

function assignments(rows: ChipRow[]): Assignment[] {
  const found: Assignment[] = [];
  const extend = (index: number, chosen: Assignment) => {
    if (index === rows.length) {
      found.push(chosen);
      return;
    }
    for (const week of rows[index].weeks)
      if (
        !chosen.includes(week) &&
        freeHitBeside(rows, chosen, index, week) === undefined
      )
        extend(index + 1, [...chosen, week]);
    extend(index + 1, [...chosen, null]);
  };
  extend(0, []);
  return found;
}

function savedValue(rows: ChipRow[], assignment: Assignment): number {
  return rows.reduce(
    (sum, row, index) =>
      assignment[index] === null && !row.expires ? sum + row.threshold : sum,
    0,
  );
}

function bestAssignment(evaluate: Evaluate, rows: ChipRow[]): Assignment {
  const none = rows.map(() => null);
  let best: { assignment: Assignment; value: number } = {
    assignment: none,
    value: savedValue(rows, none),
  };
  for (const assignment of assignments(rows)) {
    const gain = gainOf(evaluate, rows, assignment);
    if (gain === null) continue;
    const value = gain + savedValue(rows, assignment);
    if (value <= best.value) continue;
    const allQualify = assignment.every((week, row) => {
      if (week === null) return true;
      const added = marginal(evaluate, rows, assignment, row);
      return added !== null && qualifies(rows[row], added);
    });
    if (allQualify) best = { assignment, value };
  }
  return best.assignment;
}

function optionsFor(
  evaluate: Evaluate,
  rows: ChipRow[],
  chosen: Assignment,
  row: number,
): ChipOption[] {
  return rows[row].weeks.flatMap((week): ChipOption[] => {
    const rest = without(chosen, row).map((other) =>
      other === week ? null : other,
    );
    const trial = rest.map((other, index) => (index === row ? week : other));
    const value = evaluate(playsOf(rows, trial));
    const added = marginal(evaluate, rows, trial, row);
    return value && added !== null
      ? [{ week, gain: Math.max(0, added), path: value.weeks }]
      : [];
  });
}

export function bestOption(options: ChipOption[]): ChipOption {
  return options.reduce((best, option) =>
    option.gain > best.gain ? option : best,
  );
}

function holdReason(
  rows: ChipRow[],
  chosen: Assignment,
  row: number,
  best: ChipOption,
): ChipRecommendation {
  if (!qualifies(rows[row], best.gain))
    return { kind: "hold", reason: "below-threshold" };
  const owner = chosen.findIndex(
    (week, index) => index !== row && week === best.week,
  );
  if (owner >= 0)
    return { kind: "hold", reason: "week-taken", takenBy: rows[owner].chip };
  const freeHitWeek = freeHitBeside(rows, chosen, row, best.week);
  return freeHitWeek === undefined
    ? { kind: "hold", reason: "below-threshold" }
    : { kind: "hold", reason: "next-to-free-hit", freeHitWeek };
}

export function chooseChips(
  evaluate: Evaluate,
  rows: ChipRow[],
): (ChipChoice | null)[] {
  const chosen = bestAssignment(evaluate, rows);
  return rows.map((row, index): ChipChoice | null => {
    const options = optionsFor(evaluate, rows, chosen, index);
    if (!options.length) return null;
    const week = chosen[index];
    const played = options.find((option) => option.week === week);
    if (week === null || !played)
      return {
        options,
        recommendation: holdReason(rows, chosen, index, bestOption(options)),
      };
    return {
      options,
      recommendation: {
        kind: "play",
        week,
        reason: played.gain > row.threshold ? "clears-bar" : "expires",
      },
    };
  });
}
