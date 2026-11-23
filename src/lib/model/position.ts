import type { Player } from "../schemas";

export const POSITIONS = [1, 2, 3, 4] as const;
export type Position = (typeof POSITIONS)[number];

export function positionOf(player: Pick<Player, "element_type">): Position {
  const position = POSITIONS.find((id) => id === player.element_type);
  if (position === undefined)
    throw new Error(`Unknown player position ${player.element_type}.`);
  return position;
}
