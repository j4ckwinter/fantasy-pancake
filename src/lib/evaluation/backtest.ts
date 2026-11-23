import type { Data, Player } from "../schemas";
import { scorePlayer, upcomingWeeks } from "../model";
import { positionOf, type Position } from "../model/position";
import type { SeasonArchive } from "./backtest-schema";
import { inputsAtDeadline } from "./backtest-inputs";
import {
  bias,
  meanAbsoluteError,
  spearman,
  topHitRate,
  type Pair,
} from "./backtest-metrics";

export type PlayerScorer = (data: Data, player: Player, week: number) => number;

export type ForecastRow = {
  deadline: number;
  target: number;
  playerId: number;
  position: Position;
  predicted: number;
  actual: number;
  appeared: boolean;
};

export type AccuracySummary = {
  playerWeeks: number;
  maeAll: number;
  biasAll: number;
  appearedPlayerWeeks: number;
  maeAppeared: number;
  biasAppeared: number;
  horizonSpearman: number;
  topHitRate: number;
};

export type AccuracyReport = Record<"all" | Position, AccuracySummary>;

export type CalibrationBucket = {
  from: number;
  to: number;
  playerWeeks: number;
  meanPredicted: number;
  meanActual: number;
};

const TOP_N_PER_POSITION = 10;
const CALIBRATION_BUCKET_EDGES = [0, 0.5, 1, 2, 3, 4, 5, 6, Infinity];
const TOP_N_OVERALL = 20;

export function completedGameweeks(archive: SeasonArchive): number[] {
  return archive.bootstrap.events
    .filter((event) => event.finished)
    .map((event) => event.id)
    .sort((a, b) => a - b);
}

function outcome(archive: SeasonArchive, playerId: number, target: number) {
  const rows = (archive.histories[String(playerId)] ?? []).filter(
    (row) => row.round === target,
  );
  return {
    actual: rows.reduce((sum, row) => sum + row.total_points, 0),
    appeared: rows.some((row) => row.minutes > 0),
  };
}

export function forecastRows(
  archive: SeasonArchive,
  deadlines: readonly number[],
  score: PlayerScorer = scorePlayer,
): ForecastRow[] {
  const completed = new Set(completedGameweeks(archive));
  return deadlines.flatMap((deadline) => {
    const { data } = inputsAtDeadline(archive, deadline);
    const targets = upcomingWeeks(data).filter((week) => completed.has(week));
    return data.bootstrap.elements.flatMap((player) =>
      targets.map((target) => ({
        deadline,
        target,
        playerId: player.id,
        position: positionOf(player),
        predicted: score(data, player, target),
        ...outcome(archive, player.id, target),
      })),
    );
  });
}

function horizonTotals(rows: readonly ForecastRow[]) {
  const byDeadline = new Map<number, Map<number, Pair & { id: number }>>();
  for (const row of rows) {
    const players = byDeadline.get(row.deadline) ?? new Map();
    byDeadline.set(row.deadline, players);
    const totals = players.get(row.playerId) ?? {
      id: row.playerId,
      predicted: 0,
      actual: 0,
    };
    totals.predicted += row.predicted;
    totals.actual += row.actual;
    players.set(row.playerId, totals);
  }
  return [...byDeadline.values()].map((players) => [...players.values()]);
}

const mean = (values: readonly number[]) => {
  const finite = values.filter(Number.isFinite);
  return finite.length
    ? finite.reduce((sum, value) => sum + value, 0) / finite.length
    : NaN;
};

function summarise(
  rows: readonly ForecastRow[],
  topN: number,
): AccuracySummary {
  const appeared = rows.filter((row) => row.appeared);
  const deadlines = horizonTotals(rows);
  return {
    playerWeeks: rows.length,
    maeAll: meanAbsoluteError(rows),
    biasAll: bias(rows),
    appearedPlayerWeeks: appeared.length,
    maeAppeared: meanAbsoluteError(appeared),
    biasAppeared: bias(appeared),
    horizonSpearman: mean(deadlines.map(spearman)),
    topHitRate: mean(deadlines.map((totals) => topHitRate(totals, topN))),
  };
}

export function accuracyReport(rows: readonly ForecastRow[]): AccuracyReport {
  const byPosition = (position: Position) =>
    summarise(
      rows.filter((row) => row.position === position),
      TOP_N_PER_POSITION,
    );
  return {
    all: summarise(rows, TOP_N_OVERALL),
    1: byPosition(1),
    2: byPosition(2),
    3: byPosition(3),
    4: byPosition(4),
  };
}

export function calibrationCurve(
  rows: readonly ForecastRow[],
): CalibrationBucket[] {
  return CALIBRATION_BUCKET_EDGES.slice(1).map((to, index) => {
    const from = CALIBRATION_BUCKET_EDGES[index];
    const bucket = rows.filter(
      (row) => row.predicted >= from && row.predicted < to,
    );
    return {
      from,
      to,
      playerWeeks: bucket.length,
      meanPredicted: mean(bucket.map((row) => row.predicted)),
      meanActual: mean(bucket.map((row) => row.actual)),
    };
  });
}
