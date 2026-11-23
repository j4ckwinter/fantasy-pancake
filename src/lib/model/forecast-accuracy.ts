export type ForecastAccuracy = {
  readonly measuredOn: string;
  readonly season: string;
  readonly firstValidationGameweek: number;
  readonly lastValidationGameweek: number;
  readonly meanAbsoluteErrorWhenPlaying: number;
  readonly replayedTopTransferForecastGain: number;
  readonly replayedTopTransferRealisedGain: number;
};

export const FORECAST_ACCURACY: ForecastAccuracy = {
  measuredOn: "2026-11-23",
  season: "2026/27",
  firstValidationGameweek: 7,
  lastValidationGameweek: 10,
  meanAbsoluteErrorWhenPlaying: 1.9,
  replayedTopTransferForecastGain: 7.6,
  replayedTopTransferRealisedGain: 1.4,
};
