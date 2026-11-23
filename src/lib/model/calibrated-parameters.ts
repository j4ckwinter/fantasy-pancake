import type { Position } from "./position";

export type ForecastParameters = {
  readonly positionScale: Readonly<Record<Position, number>>;
  readonly seasonMinutesPriorMatches: number;
  readonly recentRateSeasonWeight: number;
  readonly bonusPrior90: number;
  readonly attackChangePerDifficulty: number;
  readonly concededChangePerDifficulty: number;
};

export const UNCALIBRATED_PARAMETERS: ForecastParameters = {
  positionScale: { 1: 1, 2: 1, 3: 1, 4: 1 },
  seasonMinutesPriorMatches: 2,
  recentRateSeasonWeight: 2,
  bonusPrior90: 0,
  attackChangePerDifficulty: 0.12,
  concededChangePerDifficulty: 0.15,
};

export const CALIBRATED_PARAMETERS: ForecastParameters = {
  positionScale: { 1: 1.1, 2: 0.92, 3: 0.87, 4: 0.94 },
  seasonMinutesPriorMatches: 0.5,
  recentRateSeasonWeight: 8,
  bonusPrior90: 0.5,
  attackChangePerDifficulty: 0.24,
  concededChangePerDifficulty: 0.22,
};
