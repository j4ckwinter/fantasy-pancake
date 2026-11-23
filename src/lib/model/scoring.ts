import type { AvailabilityScenario, Data, Player } from "../schemas";
import { playerForecast, type PlayerForecast } from "./forecast-history";
import { opponentFactors, type OpponentFactors } from "./opponent-strength";
import { LONG_APPEARANCE_MINUTES, fullMatches } from "./match-minutes";
import { positionOf, type Position } from "./position";
import { upcomingWeeks } from "./schedule";

type PositionScoring = {
  goalPoints: number;
  cleanSheetPoints: number;
  defensiveContributionThreshold: number | null;
  scoresSaves: boolean;
  losesPointsForConceding: boolean;
};

const POSITION_SCORING: Record<Position, PositionScoring> = {
  1: {
    goalPoints: 10,
    cleanSheetPoints: 4,
    defensiveContributionThreshold: null,
    scoresSaves: true,
    losesPointsForConceding: true,
  },
  2: {
    goalPoints: 6,
    cleanSheetPoints: 4,
    defensiveContributionThreshold: 10,
    scoresSaves: false,
    losesPointsForConceding: true,
  },
  3: {
    goalPoints: 5,
    cleanSheetPoints: 1,
    defensiveContributionThreshold: 12,
    scoresSaves: false,
    losesPointsForConceding: false,
  },
  4: {
    goalPoints: 4,
    cleanSheetPoints: 0,
    defensiveContributionThreshold: 12,
    scoresSaves: false,
    losesPointsForConceding: false,
  },
};
const APPEARANCE_POINTS = 1;
const ASSIST_POINTS = 3;
const DEFENSIVE_CONTRIBUTION_POINTS = 2;
const SAVES_PER_POINT = 3;
const PENALTY_SAVE_POINTS = 5;
const GOALS_CONCEDED_PER_DEDUCTION = 2;
const MAX_BONUS_POINTS = 3;
const RED_CARD_DEDUCTION = 3;
const OWN_GOAL_DEDUCTION = 2;
const PENALTY_MISS_DEDUCTION = 2;
const NORMAL_APPROXIMATION_MEAN = 100;
const MIN_POISSON_TERMS = 60;
const POISSON_TAIL_DEVIATIONS = 12;
const SMALL_SAMPLE_MINUTES = 450;
const UNCERTAIN_MINUTES = 70;
const FEW_SEASON_STARTS = 5;

export function expectedMinutes(data: Data, player: Player): number {
  return playerForecast(data, player).minutes;
}

export const DEFAULT_AVAILABILITY_SCENARIO: AvailabilityScenario = "persistent";
const AVAILABLE_STATUS = "a";
const UNAVAILABLE_STATUSES: ReadonlySet<string> = new Set(["u", "i", "s", "n"]);
const RECOVERABLE_STATUSES: ReadonlySet<string> = new Set(["i", "s", "d"]);
const FLAGGED_WITHOUT_CHANCE_AVAILABILITY = 0.5;

export function availability(player: Player): number {
  if (UNAVAILABLE_STATUSES.has(player.status)) return 0;
  return player.chance_of_playing_next_round === null
    ? player.status === AVAILABLE_STATUS
      ? 1
      : FLAGGED_WITHOUT_CHANCE_AVAILABILITY
    : player.chance_of_playing_next_round / 100;
}

function recoversUnder(scenario: AvailabilityScenario, player: Player) {
  return (
    scenario === "recover-next-week" && RECOVERABLE_STATUSES.has(player.status)
  );
}

export function weekAvailability(
  data: Data,
  player: Player,
  week: number,
  scenario: AvailabilityScenario = DEFAULT_AVAILABILITY_SCENARIO,
): number {
  const firstWeek = upcomingWeeks(data)[0];
  if (
    recoversUnder(scenario, player) &&
    firstWeek !== undefined &&
    week > firstWeek
  )
    return 1;
  return availability(player);
}

function poissonAtLeast(mean: number, threshold: number): number {
  if (mean <= 0) return 0;
  let probability = Math.exp(-mean);
  let cumulative = probability;
  for (let count = 1; count < threshold; count++) {
    probability *= mean / count;
    cumulative += probability;
  }
  return Math.max(0, Math.min(1, 1 - cumulative));
}

function expectedGroups(mean: number, groupSize: number): number {
  if (mean <= 0) return 0;
  if (mean > NORMAL_APPROXIMATION_MEAN)
    return (mean - (groupSize - 1) / 2) / groupSize;
  let probability = Math.exp(-mean);
  let result = 0;
  const limit = Math.ceil(
    Math.max(
      MIN_POISSON_TERMS,
      mean + POISSON_TAIL_DEVIATIONS * Math.sqrt(mean),
    ),
  );
  for (let count = 1; count <= limit; count++) {
    probability *= mean / count;
    result += Math.floor(count / groupSize) * probability;
  }
  return result;
}

export function scorePlayer(
  data: Data,
  player: Player,
  week: number,
  scenario: AvailabilityScenario = DEFAULT_AVAILABILITY_SCENARIO,
): number {
  const forecast = playerForecast(data, player);
  const playing = weekAvailability(data, player, week, scenario);
  if (!playing || !forecast.minutes) return 0;
  return data.fixtures
    .filter(
      (fixture) =>
        fixture.event === week &&
        !fixture.finished &&
        (fixture.team_h === player.team || fixture.team_a === player.team),
    )
    .reduce((sum, fixture) => {
      const factors = opponentFactors(data, player, fixture);
      const rules = POSITION_SCORING[positionOf(player)];
      const matchScore = forecast.outcomes.reduce(
        (expected, outcome) =>
          !outcome.minutes || !outcome.probability
            ? expected
            : expected +
              outcome.probability *
                outcomePoints(forecast, rules, factors, outcome.minutes),
        0,
      );
      return sum + playing * matchScore;
    }, 0);
}

function outcomePoints(
  forecast: PlayerForecast,
  rules: PositionScoring,
  factors: OpponentFactors,
  minutes: number,
): number {
  const share = fullMatches(minutes);
  const conceded = forecast.xgc90 * factors.conceded * share;
  const reachesSixty = minutes >= LONG_APPEARANCE_MINUTES;
  const appearance = APPEARANCE_POINTS + Number(reachesSixty);
  const attacking =
    (forecast.xg90 * rules.goalPoints + forecast.xa90 * ASSIST_POINTS) *
    share *
    factors.attack;
  const clean = reachesSixty ? Math.exp(-conceded) * rules.cleanSheetPoints : 0;
  const defensive =
    rules.defensiveContributionThreshold === null
      ? 0
      : DEFENSIVE_CONTRIBUTION_POINTS *
        poissonAtLeast(
          forecast.defensive90 * share,
          rules.defensiveContributionThreshold,
        );
  const saves = rules.scoresSaves
    ? expectedGroups(forecast.saves90 * share, SAVES_PER_POINT) +
      PENALTY_SAVE_POINTS * forecast.savedPenalties90 * share
    : 0;
  const goalsConceded = rules.losesPointsForConceding
    ? expectedGroups(conceded, GOALS_CONCEDED_PER_DEDUCTION)
    : 0;
  const bonus = Math.min(MAX_BONUS_POINTS, forecast.bonus90 * share);
  const deductions =
    share *
    (forecast.yellow90 +
      RED_CARD_DEDUCTION * forecast.red90 +
      OWN_GOAL_DEDUCTION * forecast.ownGoals90 +
      PENALTY_MISS_DEDUCTION * forecast.missedPenalties90);
  return (
    appearance +
    attacking +
    clean +
    defensive +
    saves +
    bonus -
    goalsConceded -
    deductions
  );
}

export function playerRisks(
  data: Data,
  player: Player,
  scenario: AvailabilityScenario = DEFAULT_AVAILABILITY_SCENARIO,
): string[] {
  const forecast = playerForecast(data, player);
  const result = [
    "Forecast weights and scoring probabilities are assumptions, not validated predictive accuracy.",
  ];
  result.push(
    forecast.historyMatches
      ? `Uses ${forecast.historyMatches} completed recent matches, blended with season evidence; role changes remain uncertain.`
      : "Recent match history is unavailable; season averages can miss recent changes in role.",
  );
  if (forecast.minutesBasis === "recent-starts")
    result.push(
      "Four consecutive completed starts: recent usage receives extra weight; older appearances remain in the minutes forecast. This does not establish future selection.",
    );
  if (player.minutes < SMALL_SAMPLE_MINUTES)
    result.push(
      `Small sample: fewer than ${SMALL_SAMPLE_MINUTES} minutes; attacking rates are shrunk toward positional assumptions.`,
    );
  if (forecast.minutes < UNCERTAIN_MINUTES)
    result.push(
      `Uncertain minutes: estimated ${Math.round(forecast.minutes)} per match, ${Math.round(forecast.sixtyProbability * 100)}% chance of reaching ${LONG_APPEARANCE_MINUTES} minutes before availability adjustments.`,
    );
  if (player.starts < FEW_SEASON_STARTS)
    result.push(
      "Fewer than five season starts: the starting-role sample remains small.",
    );
  if (player.chance_of_playing_next_round === null)
    result.push(
      "No explicit next-round playing probability is supplied by FPL.",
    );
  if (availability(player) < 1) {
    result.push(`Availability flag: ${player.news || player.status}.`);
    result.push(
      recoversUnder(scenario, player)
        ? "Scenario assumes full availability from the second planning week; this is not a predicted recovery date."
        : "Current availability is held constant across the horizon; a short absence may be overstated.",
    );
  }
  return result;
}
