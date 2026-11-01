import type { Data, Settings } from "@/lib/schemas";
import { scorePlayer, upcomingWeeks } from "@/lib/model";

export function historyCandidates(data: Data, settings: Settings): number[] {
  const weeks = upcomingWeeks(data);
  if (!weeks.length) return [];
  const selected = new Set(settings.squad.map((pick) => pick.id));
  const candidates = data.bootstrap.elements
    .filter((player) => player.can_select && player.can_transact)
    .map((player) => ({
      player,
      score: weeks.reduce(
        (sum, week) =>
          sum + scorePlayer(data, player, week, settings.availabilityScenario),
        0,
      ),
    }));
  for (const position of data.bootstrap.element_types) {
    const group = candidates.filter(
      ({ player }) => player.element_type === position.id,
    );
    group.sort((a, b) => b.score - a.score || a.player.id - b.player.id);
    for (const { player } of group.slice(0, 12)) selected.add(player.id);
    group.sort(
      (a, b) =>
        a.player.now_cost - b.player.now_cost ||
        b.score - a.score ||
        a.player.id - b.player.id,
    );
    for (const { player } of group.slice(0, 4)) selected.add(player.id);
  }
  return [...selected];
}
