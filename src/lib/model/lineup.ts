import type { Data, Player } from "../schemas";
import type { Lineup } from "./types";
import { POSITIONS } from "./position";
import { captainOrder } from "./captaincy";

type LineupRules = {
  bootstrap: Pick<Data["bootstrap"], "element_types" | "game_settings">;
};

type Formation = { counts: number[]; score: number; captain: Player };

export function bestLineup(
  rules: LineupRules,
  squad: Player[],
  scores: ReadonlyMap<number, number>,
): Lineup {
  const { element_types, game_settings } = rules.bootstrap;
  const byCaptaincy = captainOrder(scores);
  const groups = POSITIONS.map((position) =>
    squad
      .filter((player) => player.element_type === position)
      .sort(byCaptaincy),
  );
  const points = groups.map((group) =>
    group.map((player) => scores.get(player.id) ?? 0),
  );
  const limits = POSITIONS.map((id) =>
    element_types.find((position) => position.id === id),
  );
  const found: { best: Formation | null } = { best: null };
  const counts: number[] = [];
  const choose = (index: number, chosen: number) => {
    if (index === POSITIONS.length) {
      if (chosen !== game_settings.squad_squadplay) return;
      let captain: Player | undefined;
      let score = 0;
      groups.forEach((group, position) => {
        if (!counts[position]) return;
        const head = group[0];
        if (!captain || byCaptaincy(head, captain) < 0) captain = head;
        for (let rank = 0; rank < counts[position]; rank++)
          score += points[position][rank];
      });
      if (!captain) return;
      score += scores.get(captain.id) ?? 0;
      if (score > (found.best?.score ?? -Infinity))
        found.best = { counts: [...counts], score, captain };
      return;
    }
    const limit = limits[index];
    if (!limit) throw new Error("Position rules are unavailable.");
    for (
      let count = limit.squad_min_play;
      count <= Math.min(limit.squad_max_play, groups[index].length);
      count++
    ) {
      if (chosen + count <= game_settings.squad_squadplay) {
        counts[index] = count;
        choose(index + 1, chosen + count);
      }
    }
  };
  choose(0, 0);
  const { best } = found;
  if (!best || !Number.isFinite(best.score))
    throw new Error("This squad cannot form a legal starting XI.");
  return {
    score: best.score,
    ids: groups.flatMap((group, position) =>
      group.slice(0, best.counts[position]).map((player) => player.id),
    ),
    captain: best.captain.id,
  };
}
