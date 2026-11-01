import {
  settingsSchema,
  type Data,
  type Player,
  type Settings,
} from "../schemas";

export function excessClubIds(players: Player[], limit: number): number[] {
  const counts = new Map<number, number>();
  for (const player of players)
    counts.set(player.team, (counts.get(player.team) ?? 0) + 1);
  return [...counts]
    .filter(([, count]) => count > limit)
    .map(([id]) => id)
    .sort((a, b) => a - b);
}

export function overLimitClubs(data: Data, settings: Settings): string[] {
  const byId = new Map(
    data.bootstrap.elements.map((player) => [player.id, player]),
  );
  const players = settings.squad.flatMap((pick) => {
    const player = byId.get(pick.id);
    return player ? [player] : [];
  });
  return excessClubIds(
    players,
    data.bootstrap.game_settings.squad_team_limit,
  ).map(
    (id) =>
      data.bootstrap.teams.find((team) => team.id === id)?.name ?? `Club ${id}`,
  );
}

export function validateSquad(data: Data, settings: Settings): string[] {
  const parsed = settingsSchema.safeParse(settings);
  if (!parsed.success)
    return [
      "Enter valid bank, selling prices and free transfers for all 15 players.",
    ];
  const errors: string[] = [];
  const { bootstrap } = data;
  const byId = new Map(bootstrap.elements.map((player) => [player.id, player]));
  const selected = settings.squad.flatMap((pick) => {
    const player = byId.get(pick.id);
    if (!player)
      errors.push(
        `Player ${pick.id} is no longer in the current player list. Replace them.`,
      );
    else if (pick.sellingPrice > player.now_cost)
      errors.push(
        `${player.web_name}'s selling price cannot exceed the current price.`,
      );
    return player ? [player] : [];
  });
  if (
    new Set(settings.squad.map((pick) => pick.id)).size !==
    settings.squad.length
  )
    errors.push("Each player can appear only once.");
  if (settings.squad.length !== bootstrap.game_settings.squad_squadsize)
    errors.push(`Select ${bootstrap.game_settings.squad_squadsize} players.`);
  for (const position of bootstrap.element_types) {
    if (
      selected.filter((player) => player.element_type === position.id)
        .length !== position.squad_select
    ) {
      errors.push(
        `Select exactly ${position.squad_select} ${position.singular_name_short} players.`,
      );
    }
  }
  if (
    settings.freeTransfers >
    1 + bootstrap.game_settings.max_extra_free_transfers
  )
    errors.push("Free transfers exceed the current game limit.");
  return errors;
}
