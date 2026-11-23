import type { Data, Player } from "@/lib/schemas";

type Club = Data["bootstrap"]["teams"][number];

export function findPlayer(players: Player[], id: number) {
  return players.find((player) => player.id === id);
}

export function findClub(clubs: Club[], id: number | undefined) {
  return clubs.find((club) => club.id === id);
}
