import type { AvailabilityScenario, Data, Player } from "../schemas";
import { playerForecast } from "./forecast-history";
import { opponentFactors } from "./opponent-strength";
import { upcomingWeeks } from "./schedule";

const goalWeights = [0, 10, 6, 5, 4];
const cleanWeights = [0, 4, 4, 1, 0];
export function expectedMinutes(data: Data, player: Player): number {
  return playerForecast(data, player).minutes;
}

export function availability(player: Player): number {
  if (["u", "i", "s", "n"].includes(player.status)) return 0;
  return player.chance_of_playing_next_round === null
    ? player.status === "a"
      ? 1
      : 0.5
    : player.chance_of_playing_next_round / 100;
}

export function weekAvailability(
  data: Data,
  player: Player,
  week: number,
  scenario: AvailabilityScenario = "persistent",
): number {
  const firstWeek = upcomingWeeks(data)[0];
  if (
    scenario === "recover-next-week" &&
    firstWeek !== undefined &&
    week > firstWeek &&
    ["i", "s", "d"].includes(player.status)
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
  if (mean > 100) return (mean - (groupSize - 1) / 2) / groupSize;
  let probability = Math.exp(-mean);
  let result = 0;
  const limit = Math.ceil(Math.max(60, mean + 12 * Math.sqrt(mean)));
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
  scenario: AvailabilityScenario = "persistent",
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
      const matchScore = forecast.outcomes.reduce((expected, outcome) => {
        const { minutes, probability } = outcome;
        if (!minutes || !probability) return expected;
        const share = minutes / 90;
        const conceded = forecast.xgc90 * factors.conceded * share;
        const appearance = 1 + Number(minutes >= 60);
        const attacking =
          (forecast.xg90 * goalWeights[player.element_type] +
            forecast.xa90 * 3) *
          share *
          factors.attack;
        const clean =
          minutes >= 60
            ? Math.exp(-conceded) * cleanWeights[player.element_type]
            : 0;
        const defensive =
          player.element_type === 1
            ? 0
            : 2 *
              poissonAtLeast(
                forecast.defensive90 * share,
                player.element_type === 2 ? 10 : 12,
              );
        const saves =
          player.element_type === 1
            ? expectedGroups(forecast.saves90 * share, 3) +
              5 * forecast.savedPenalties90 * share
            : 0;
        const goalsConceded =
          player.element_type <= 2 ? expectedGroups(conceded, 2) : 0;
        const bonus = Math.min(3, forecast.bonus90 * share);
        const deductions =
          share *
          (forecast.yellow90 +
            3 * forecast.red90 +
            2 * forecast.ownGoals90 +
            2 * forecast.missedPenalties90);
        return (
          expected +
          probability *
            (appearance +
              attacking +
              clean +
              defensive +
              saves +
              bonus -
              goalsConceded -
              deductions)
        );
      }, 0);
      return sum + playing * matchScore;
    }, 0);
}

export function playerRisks(
  data: Data,
  player: Player,
  scenario: AvailabilityScenario = "persistent",
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
  if (player.minutes < 450)
    result.push(
      "Small sample: fewer than 450 minutes; attacking rates are shrunk toward positional assumptions.",
    );
  if (forecast.minutes < 70)
    result.push(
      `Uncertain minutes: estimated ${Math.round(forecast.minutes)} per match, ${Math.round(forecast.sixtyProbability * 100)}% chance of reaching 60 minutes before availability adjustments.`,
    );
  if (player.starts < 5)
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
      scenario === "recover-next-week" &&
        ["i", "s", "d"].includes(player.status)
        ? "Scenario assumes full availability from the second planning week; this is not a predicted recovery date."
        : "Current availability is held constant across the horizon; a short absence may be overstated.",
    );
  }
  return result;
}
