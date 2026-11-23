import type { Data, Player } from "../schemas";
import { isTransferable } from "./transfer-legality";
import type { Position } from "./position";

export const STRONG_CANDIDATES_PER_POSITION = 4;
export const CHEAP_CANDIDATES_PER_POSITION = 2;

export type CandidatePool = Record<Position, Player[]>;

export function candidatePool(
  data: Data,
  squad: Player[],
  scores: ReadonlyMap<number, number>[],
): CandidatePool {
  const owned = new Set(squad.map((player) => player.id));
  const horizonScore = (player: Player) =>
    scores.reduce((sum, week) => sum + (week.get(player.id) ?? 0), 0);
  const forPosition = (position: Position) => {
    const eligible = data.bootstrap.elements.filter(
      (player) =>
        player.element_type === position &&
        !owned.has(player.id) &&
        isTransferable(player),
    );
    const best = [...eligible]
      .sort((a, b) => horizonScore(b) - horizonScore(a) || a.id - b.id)
      .slice(0, STRONG_CANDIDATES_PER_POSITION);
    const cheap = [...eligible]
      .sort(
        (a, b) =>
          a.now_cost - b.now_cost ||
          horizonScore(b) - horizonScore(a) ||
          a.id - b.id,
      )
      .slice(0, CHEAP_CANDIDATES_PER_POSITION);
    return [...new Map([...best, ...cheap].map((p) => [p.id, p])).values()];
  };
  return {
    1: forPosition(1),
    2: forPosition(2),
    3: forPosition(3),
    4: forPosition(4),
  };
}
