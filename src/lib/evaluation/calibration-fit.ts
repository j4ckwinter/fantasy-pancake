import type { ForecastParameters } from "../model/calibrated-parameters";
import { POSITIONS } from "../model/position";
import type { ForecastRow } from "./backtest";

export type TunedParameter = Exclude<keyof ForecastParameters, "positionScale">;
export type ParameterGrid = Readonly<Record<TunedParameter, readonly number[]>>;
export type RowsFor = (parameters: ForecastParameters) => ForecastRow[];

const COORDINATE_PASSES = 2;
const SCALE_DECIMALS = 2;

export function meanSquaredError(rows: readonly ForecastRow[]): number {
  return (
    rows.reduce((sum, row) => sum + (row.predicted - row.actual) ** 2, 0) /
    rows.length
  );
}

const rounded = (value: number) =>
  Math.round(value * 10 ** SCALE_DECIMALS) / 10 ** SCALE_DECIMALS;

function withFittedScales(
  parameters: ForecastParameters,
  rowsFor: RowsFor,
): ForecastParameters {
  const unscaled = rowsFor({
    ...parameters,
    positionScale: { 1: 1, 2: 1, 3: 1, 4: 1 },
  });
  const scale = (position: (typeof POSITIONS)[number]) => {
    const rows = unscaled.filter((row) => row.position === position);
    const fitted =
      rows.reduce((sum, row) => sum + row.predicted * row.actual, 0) /
      rows.reduce((sum, row) => sum + row.predicted ** 2, 0);
    return Number.isFinite(fitted) ? rounded(fitted) : 1;
  };
  return {
    ...parameters,
    positionScale: { 1: scale(1), 2: scale(2), 3: scale(3), 4: scale(4) },
  };
}

export function fitParameters(
  start: ForecastParameters,
  grid: ParameterGrid,
  trainingRows: RowsFor,
): ForecastParameters {
  let best = withFittedScales(start, trainingRows);
  let bestError = meanSquaredError(trainingRows(best));
  for (let pass = 0; pass < COORDINATE_PASSES; pass++) {
    for (const name of Object.keys(grid) as TunedParameter[]) {
      for (const value of grid[name]) {
        const candidate = withFittedScales(
          { ...best, [name]: value },
          trainingRows,
        );
        const error = meanSquaredError(trainingRows(candidate));
        if (error < bestError) {
          best = candidate;
          bestError = error;
        }
      }
    }
  }
  return best;
}
