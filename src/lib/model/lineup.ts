import type { Data, Player } from "../schemas";
import type { Lineup } from "./types";

const positions = [1, 2, 3, 4];

export function bestLineup(
  data: Data,
  squad: Player[],
  scores: ReadonlyMap<number, number>,
): Lineup {
  const groups = positions.map((position) =>
    squad
      .filter((player) => player.element_type === position)
      .sort(
        (a, b) =>
          (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) || a.id - b.id,
      ),
  );
  let best: Lineup = { score: -Infinity, ids: [], captain: null };
  const limits = positions.map((id) =>
    data.bootstrap.element_types.find((position) => position.id === id),
  );
  const choose = (index: number, chosen: Player[]) => {
    if (index === positions.length) {
      if (chosen.length !== data.bootstrap.game_settings.squad_squadplay)
        return;
      const ranked = [...chosen].sort(
        (a, b) =>
          (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) || a.id - b.id,
      );
      const captain = ranked[0];
      const score =
        chosen.reduce((sum, player) => sum + (scores.get(player.id) ?? 0), 0) +
        (captain ? (scores.get(captain.id) ?? 0) : 0);
      if (score > best.score)
        best = {
          score,
          ids: chosen.map((player) => player.id),
          captain: captain?.id ?? null,
        };
      return;
    }
    const limit = limits[index];
    if (!limit) throw new Error("Position rules are unavailable.");
    for (
      let count = limit.squad_min_play;
      count <= Math.min(limit.squad_max_play, groups[index].length);
      count++
    ) {
      if (chosen.length + count <= data.bootstrap.game_settings.squad_squadplay)
        choose(index + 1, [...chosen, ...groups[index].slice(0, count)]);
    }
  };
  choose(0, []);
  if (!Number.isFinite(best.score))
    throw new Error("This squad cannot form a legal starting XI.");
  return best;
}
