import type { Data, Player } from "../schemas";
import type { Lineup } from "./types";
import { POSITIONS } from "./position";

type LineupRules = {
  bootstrap: Pick<Data["bootstrap"], "element_types" | "game_settings">;
};

export function bestLineup(
  rules: LineupRules,
  squad: Player[],
  scores: ReadonlyMap<number, number>,
): Lineup {
  const { element_types, game_settings } = rules.bootstrap;
  const byScore = (a: Player, b: Player) =>
    (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) || a.id - b.id;
  const groups = POSITIONS.map((position) =>
    squad.filter((player) => player.element_type === position).sort(byScore),
  );
  const found: { best: Lineup | null } = { best: null };
  const limits = POSITIONS.map((id) =>
    element_types.find((position) => position.id === id),
  );
  const choose = (index: number, chosen: Player[]) => {
    if (index === POSITIONS.length) {
      if (chosen.length !== game_settings.squad_squadplay) return;
      const [captain] = [...chosen].sort(byScore);
      if (!captain) return;
      const score =
        chosen.reduce((sum, player) => sum + (scores.get(player.id) ?? 0), 0) +
        (scores.get(captain.id) ?? 0);
      if (score > (found.best?.score ?? -Infinity))
        found.best = {
          score,
          ids: chosen.map((player) => player.id),
          captain: captain.id,
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
      if (chosen.length + count <= game_settings.squad_squadplay)
        choose(index + 1, [...chosen, ...groups[index].slice(0, count)]);
    }
  };
  choose(0, []);
  const { best } = found;
  if (!best || !Number.isFinite(best.score))
    throw new Error("This squad cannot form a legal starting XI.");
  return best;
}
