import type { Data, Player } from "../schemas";
import type { Lineup } from "./types";
import { positionOf, type Position } from "./position";
import { roundScore } from "./round-score";

export type CaptainOption = {
  playerId: number;
  expectedPoints: number;
  gapToNext: number | null;
};

export type BenchSlot = {
  playerId: number;
  expectedPoints: number;
  coverChance: number;
  expectedContribution: number;
};

export type Captaincy = {
  week: number;
  captain: CaptainOption;
  viceCaptain: CaptainOption;
  otherOptions: CaptainOption[];
  benchGoalkeeper: number | null;
  bench: BenchSlot[];
};

export type WeekForecast = {
  week: number;
  expectedPoints: ReadonlyMap<number, number>;
  playChance: ReadonlyMap<number, number>;
};

type FormationRules = {
  bootstrap: Pick<Data["bootstrap"], "element_types">;
};

type Formation = Map<Position, { count: number; min: number; max: number }>;

export function rankCaptains<P extends Pick<Player, "id">>(
  starters: readonly P[],
  expectedPoints: ReadonlyMap<number, number>,
): P[] {
  return [...starters].sort(
    (a, b) =>
      (expectedPoints.get(b.id) ?? 0) - (expectedPoints.get(a.id) ?? 0) ||
      a.id - b.id,
  );
}

export function weekCaptaincy(
  rules: FormationRules,
  squad: Player[],
  lineup: Pick<Lineup, "ids">,
  forecast: WeekForecast,
): Captaincy {
  const starters = squad.filter((player) => lineup.ids.includes(player.id));
  const [captain, viceCaptain, ...otherOptions] = captainOptions(
    starters,
    forecast.expectedPoints,
  );
  if (!captain || !viceCaptain)
    throw new Error("A starting XI needs at least two players to captain.");
  const reserves = squad.filter((player) => !lineup.ids.includes(player.id));
  const goalkeeper = reserves.find((player) => positionOf(player) === 1);
  return {
    week: forecast.week,
    captain,
    viceCaptain,
    otherOptions,
    benchGoalkeeper: goalkeeper?.id ?? null,
    bench: benchOrder(
      formation(rules, starters),
      starters,
      reserves.filter((player) => positionOf(player) !== 1),
      forecast,
    ),
  };
}

function captainOptions(
  starters: Player[],
  expectedPoints: ReadonlyMap<number, number>,
): CaptainOption[] {
  const ranked = rankCaptains(starters, expectedPoints);
  const points = (player: Player | undefined) =>
    player ? (expectedPoints.get(player.id) ?? 0) : null;
  return ranked.map((player, index) => {
    const own = points(player) ?? 0;
    const next = points(ranked[index + 1]);
    return {
      playerId: player.id,
      expectedPoints: roundScore(own),
      gapToNext: next === null ? null : roundScore(own - next),
    };
  });
}

function formation(rules: FormationRules, starters: Player[]): Formation {
  return new Map(
    rules.bootstrap.element_types.map((type) => {
      const position = positionOf({ element_type: type.id });
      const count = starters.filter(
        (player) => positionOf(player) === position,
      ).length;
      const limits = {
        count,
        min: type.squad_min_play,
        max: type.squad_max_play,
      };
      return [position, limits] as const;
    }),
  );
}

function canReplace(
  shape: Formation,
  starter: Player,
  substitute: Player,
): boolean {
  const leaving = positionOf(starter);
  const entering = positionOf(substitute);
  if (leaving === entering) return true;
  const out = shape.get(leaving);
  const into = shape.get(entering);
  return (
    !!out && !!into && out.count - 1 >= out.min && into.count + 1 <= into.max
  );
}

function benchOrder(
  shape: Formation,
  starters: Player[],
  outfieldReserves: Player[],
  forecast: WeekForecast,
): BenchSlot[] {
  const slots = outfieldReserves.map((substitute) => {
    const allCompatiblePlay = starters
      .filter((starter) => canReplace(shape, starter, substitute))
      .reduce(
        (chance, starter) =>
          chance * (forecast.playChance.get(starter.id) ?? 0),
        1,
      );
    const coverChance = 1 - allCompatiblePlay;
    const expectedPoints = forecast.expectedPoints.get(substitute.id) ?? 0;
    return {
      playerId: substitute.id,
      expectedPoints,
      coverChance,
      expectedContribution: coverChance * expectedPoints,
    };
  });
  return slots
    .sort(
      (a, b) =>
        b.expectedContribution - a.expectedContribution ||
        b.expectedPoints - a.expectedPoints ||
        a.playerId - b.playerId,
    )
    .map((slot) => ({
      playerId: slot.playerId,
      expectedPoints: roundScore(slot.expectedPoints),
      coverChance: roundScore(slot.coverChance),
      expectedContribution: roundScore(slot.expectedContribution),
    }));
}
