import type { AvailabilityScenario, Data, Player } from "../schemas";
import { playerForecast } from "./forecast-history";
import { LONG_APPEARANCE_MINUTES } from "./match-minutes";
import { FORECAST_ACCURACY } from "./forecast-accuracy";
import {
  DEFAULT_AVAILABILITY_SCENARIO,
  availability,
  recoversUnder,
} from "./scoring";

const SMALL_SAMPLE_MINUTES = 450;
const UNCERTAIN_MINUTES = 70;
const FEW_SEASON_STARTS = 5;

export function playerRisks(
  data: Data,
  player: Player,
  scenario: AvailabilityScenario = DEFAULT_AVAILABILITY_SCENARIO,
): string[] {
  const forecast = playerForecast(data, player);
  const result = [
    `Expected points are averages: in this season's backtest, forecasts for players who played were off by ${FORECAST_ACCURACY.meanAbsoluteErrorWhenPlaying} points a gameweek on average.`,
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
