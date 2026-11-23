import type { Data, Player } from "../schemas";
import { scorePlayer, upcomingWeeks } from "../model";
import {
  CALIBRATED_PARAMETERS,
  UNCALIBRATED_PARAMETERS,
  type ForecastParameters,
} from "../model/calibrated-parameters";
import { DEFAULT_AVAILABILITY_SCENARIO } from "../model/scoring";
import type { SeasonArchive } from "./backtest-schema";
import {
  accuracyReport,
  calibrationCurve,
  completedGameweeks,
  forecastRows,
  type AccuracyReport,
  type ForecastRow,
} from "./backtest";
import { inputsAtDeadline } from "./backtest-inputs";
import { sampleSettings, seededRandom } from "./backtest-squads";
import {
  DECISION_POLICIES,
  decideForSquad,
  type DecisionPolicy,
  type SquadDecision,
  type WeeklyScores,
} from "./backtest-decisions";
import {
  laggedPointsScores,
  seasonPointsPerMatchScores,
} from "./baseline-policies";
import {
  fitParameters,
  meanSquaredError,
  type ParameterGrid,
} from "./calibration-fit";

export const FIRST_BACKTEST_DEADLINE = 3;
export const LAST_TRAINING_GAMEWEEK = 6;
const SQUADS_PER_DEADLINE = 25;
const SQUAD_SEED = 20261123;
const PREDICTED_GAIN_BANDS = [0, 2, 4, 8, 16, Infinity];

export const CALIBRATION_GRID: ParameterGrid = {
  seasonMinutesPriorMatches: [0.5, 1, 2, 3, 4, 6],
  recentRateSeasonWeight: [0.5, 1, 2, 3, 4, 6, 8],
  bonusPrior90: [0, 0.1, 0.2, 0.3, 0.5],
  attackChangePerDifficulty: [0, 0.06, 0.12, 0.18, 0.24],
  concededChangePerDifficulty: [0, 0.08, 0.15, 0.22, 0.3],
};

const scorerWith =
  (parameters: ForecastParameters) =>
  (data: Data, player: Player, week: number) =>
    scorePlayer(data, player, week, DEFAULT_AVAILABILITY_SCENARIO, parameters);

export function backtestDeadlines(archive: SeasonArchive): number[] {
  return completedGameweeks(archive).filter(
    (week) => week >= FIRST_BACKTEST_DEADLINE,
  );
}

export function trainingRows(rows: readonly ForecastRow[]): ForecastRow[] {
  return rows.filter((row) => row.target <= LAST_TRAINING_GAMEWEEK);
}

export function validationRows(rows: readonly ForecastRow[]): ForecastRow[] {
  return rows.filter((row) => row.deadline > LAST_TRAINING_GAMEWEEK);
}

function splitReport(rows: readonly ForecastRow[]) {
  const train = trainingRows(rows);
  const validation = validationRows(rows);
  return {
    train: accuracyReport(train),
    validation: accuracyReport(validation),
    trainCurve: calibrationCurve(train),
    validationCurve: calibrationCurve(validation),
    trainMse: meanSquaredError(train),
    validationMse: meanSquaredError(validation),
  };
}

export function calibrationValidates(
  before: AccuracyReport,
  after: AccuracyReport,
): boolean {
  return (
    after.all.maeAll < before.all.maeAll &&
    after.all.horizonSpearman > before.all.horizonSpearman
  );
}

function actualPoints(archive: SeasonArchive) {
  const totals = new Map<string, number>();
  for (const [id, rows] of Object.entries(archive.histories))
    for (const row of rows) {
      const key = `${id}:${row.round}`;
      totals.set(key, (totals.get(key) ?? 0) + row.total_points);
    }
  return (playerId: number, week: number) =>
    totals.get(`${playerId}:${week}`) ?? 0;
}

function decisions(
  archive: SeasonArchive,
  deadlines: readonly number[],
  parameters: ForecastParameters,
): SquadDecision[] {
  const completed = new Set(completedGameweeks(archive));
  const actual = actualPoints(archive);
  const score = scorerWith(parameters);
  return deadlines.flatMap((deadline) => {
    const { data, ownership } = inputsAtDeadline(archive, deadline);
    const weeks = upcomingWeeks(data);
    if (!weeks.every((week) => completed.has(week))) return [];
    const policyScores: Record<DecisionPolicy, WeeklyScores> = {
      model: weeks.map(
        (week) =>
          new Map(
            data.bootstrap.elements.map((player) => [
              player.id,
              score(data, player, week),
            ]),
          ),
      ),
      seasonPoints: seasonPointsPerMatchScores(data, weeks),
      laggedPoints: laggedPointsScores(data, weeks),
    };
    return sampleSettings(
      data,
      ownership,
      SQUADS_PER_DEADLINE,
      seededRandom(SQUAD_SEED + deadline),
    ).map((settings, squad) => ({
      deadline,
      squad,
      ...decideForSquad(data, settings, weeks, policyScores, actual),
    }));
  });
}

const average = (values: readonly number[]) =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : NaN;

function standardError(values: readonly number[]): number {
  const centre = average(values);
  const variance =
    values.reduce((sum, value) => sum + (value - centre) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance / values.length);
}

export function decisionSummary(results: readonly SquadDecision[]) {
  const recommended = results.filter((result) => result.modelRecommends);
  return {
    squads: results.length,
    modelRecommendations: recommended.length,
    recommendedMeanRealisedGainOverHold: average(
      recommended.map((result) => result.realisedGain.model),
    ),
    recommendedRealisedGainStandardError: standardError(
      recommended.map((result) => result.realisedGain.model),
    ),
    recommendedBeatHoldShare: average(
      recommended.map((result) => Number(result.realisedGain.model > 0)),
    ),
    recommendedMeanPredictedGain: average(
      recommended.map((result) => result.modelPredictedGain),
    ),
    bestTransferMeanRealisedGainOverHold: Object.fromEntries(
      DECISION_POLICIES.map((policy) => [
        policy,
        average(results.map((result) => result.realisedGain[policy])),
      ]),
    ),
    realisedByPredictedGain: PREDICTED_GAIN_BANDS.slice(1).map((to, index) => {
      const from = PREDICTED_GAIN_BANDS[index];
      const band = results.filter(
        (result) =>
          result.modelPredictedGain > from && result.modelPredictedGain <= to,
      );
      return {
        from,
        to: Number.isFinite(to) ? to : null,
        squads: band.length,
        meanPredictedGain: average(
          band.map((result) => result.modelPredictedGain),
        ),
        meanRealisedGain: average(
          band.map((result) => result.realisedGain.model),
        ),
      };
    }),
    modelBeatsShare: Object.fromEntries(
      DECISION_POLICIES.filter((policy) => policy !== "model").map((policy) => [
        policy,
        average(
          results.map((result) =>
            Number(result.realisedGain.model > result.realisedGain[policy]),
          ),
        ),
      ]),
    ),
  };
}

export function runBacktest(archive: SeasonArchive) {
  const deadlines = backtestDeadlines(archive);
  const rowsWith = (parameters: ForecastParameters) =>
    forecastRows(archive, deadlines, scorerWith(parameters));
  const fitted = fitParameters(UNCALIBRATED_PARAMETERS, CALIBRATION_GRID, (p) =>
    trainingRows(
      forecastRows(
        archive,
        deadlines.filter((deadline) => deadline <= LAST_TRAINING_GAMEWEEK),
        scorerWith(p),
      ),
    ),
  );
  const before = splitReport(rowsWith(UNCALIBRATED_PARAMETERS));
  const after = splitReport(rowsWith(fitted));
  return {
    deadlines,
    lastTrainingGameweek: LAST_TRAINING_GAMEWEEK,
    fitted,
    validates: calibrationValidates(before.validation, after.validation),
    committedParametersMatchFit:
      JSON.stringify(CALIBRATED_PARAMETERS) === JSON.stringify(fitted),
    uncalibrated: before,
    calibrated: after,
    decisions: {
      uncalibrated: decisionSummary(
        decisions(archive, deadlines, UNCALIBRATED_PARAMETERS),
      ),
      calibrated: decisionSummary(decisions(archive, deadlines, fitted)),
    },
  };
}
