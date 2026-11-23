import type { AvailabilityScenario, Data, Player } from "../schemas";
import { playerForecast } from "./forecast-history";
import { weekAvailability } from "./scoring";
import { scheduledTeamFixtures } from "./schedule";

export function playChance(
  data: Data,
  player: Player,
  week: number,
  scenario?: AvailabilityScenario,
): number {
  const fixtures = scheduledTeamFixtures(
    data.fixtures,
    player.team,
    week,
  ).length;
  if (!fixtures) return 0;
  const appears = playerForecast(data, player).appearanceProbability;
  const missesEvery = (1 - appears) ** fixtures;
  return weekAvailability(data, player, week, scenario) * (1 - missesEvery);
}
