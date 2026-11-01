import { z } from "zod";
const nonnegative = z.number().finite().nonnegative();
const numeric = z
  .union([z.string().regex(/^\d+(\.\d+)?$/), nonnegative])
  .transform(Number);
export const playerSchema = z.object({
  id: z.number().int().positive(),
  web_name: z.string(),
  team: z.number().int().positive(),
  element_type: z.number().int().min(1).max(4),
  now_cost: nonnegative.int(),
  status: z.string(),
  news: z.string(),
  can_select: z.boolean(),
  can_transact: z.boolean(),
  chance_of_playing_next_round: nonnegative.max(100).nullable(),
  minutes: nonnegative,
  starts: nonnegative,
  expected_goals: numeric,
  expected_assists: numeric,
  expected_goals_conceded: numeric,
  defensive_contribution: nonnegative,
  saves: nonnegative,
  creativity: numeric,
  bonus: nonnegative.optional(),
  yellow_cards: nonnegative.optional(),
  red_cards: nonnegative.optional(),
  own_goals: nonnegative.optional(),
  penalties_missed: nonnegative.optional(),
  penalties_saved: nonnegative.optional(),
  penalties_order: nonnegative.nullable(),
  corners_and_indirect_freekicks_order: nonnegative.nullable(),
  direct_freekicks_order: nonnegative.nullable(),
});
export const fixtureSchema = z.object({
  id: z.number().int(),
  event: z.number().int().nullable(),
  team_h: z.number().int(),
  team_a: z.number().int(),
  team_h_difficulty: z.number().min(1).max(5),
  team_a_difficulty: z.number().min(1).max(5),
  finished: z.boolean(),
  kickoff_time: z.string().nullable(),
});
export const bootstrapSchema = z.object({
  elements: z.array(playerSchema),
  teams: z.array(
    z.object({
      id: z.number().int(),
      name: z.string(),
      short_name: z.string(),
      strength_attack_home: nonnegative.optional(),
      strength_attack_away: nonnegative.optional(),
      strength_defence_home: nonnegative.optional(),
      strength_defence_away: nonnegative.optional(),
    }),
  ),
  events: z.array(
    z.object({
      id: z.number().int(),
      name: z.string(),
      deadline_time: z.string(),
      is_current: z.boolean(),
      is_next: z.boolean(),
      finished: z.boolean(),
    }),
  ),
  element_types: z.array(
    z.object({
      id: z.number().int(),
      singular_name_short: z.string(),
      squad_select: z.number().int(),
      squad_min_play: z.number().int(),
      squad_max_play: z.number().int(),
    }),
  ),
  game_settings: z.object({
    squad_squadsize: z.number().int(),
    squad_squadplay: z.number().int(),
    squad_team_limit: z.number().int(),
    max_extra_free_transfers: z.number().int(),
  }),
});
export const historySchema = z.object({
  history: z.array(
    z.object({
      fixture: z.number().int(),
      round: z.number().int(),
      minutes: nonnegative,
      starts: nonnegative,
      expected_goals: numeric,
      expected_assists: numeric,
      expected_goals_conceded: numeric,
      defensive_contribution: nonnegative,
      total_points: z.number(),
      opponent_team: z.number().int().optional(),
      was_home: z.boolean().optional(),
      saves: nonnegative.optional(),
      bonus: nonnegative.optional(),
      bps: z.number().optional(),
      yellow_cards: nonnegative.optional(),
      red_cards: nonnegative.optional(),
      own_goals: nonnegative.optional(),
      penalties_missed: nonnegative.optional(),
      penalties_saved: nonnegative.optional(),
      kickoff_time: z.string(),
    }),
  ),
});
export const picksSchema = z.object({
  teamName: z.string().trim().optional(),
  active_chip: z.string().nullable(),
  entry_history: z.object({ event: z.number().int(), bank: nonnegative.int() }),
  picks: z.array(z.object({ element: z.number().int() })).length(15),
});
export const settingsSchema = z.object({
  version: z.literal(1),
  entryId: z.number().int().positive(),
  teamName: z.string().trim().optional(),
  sourceGameweek: z.number().int().positive(),
  season: z.string(),
  lockedPlayerIds: z
    .array(z.number().int().positive())
    .refine(
      (ids) => new Set(ids).size === ids.length,
      "Locked players must be unique",
    )
    .optional(),
  availabilityScenario: z.enum(["persistent", "recover-next-week"]).optional(),
  bank: nonnegative.int().max(1000),
  freeTransfers: nonnegative.int().max(5),
  squad: z
    .array(
      z.object({
        id: z.number().int().positive(),
        sellingPrice: nonnegative.int().max(200),
      }),
    )
    .length(15),
});
export const dataSchema = z.object({
  bootstrap: bootstrapSchema,
  fixtures: z.array(fixtureSchema),
  fetchedAt: z.string(),
  histories: z.record(z.string(), historySchema.shape.history).optional(),
});
export type AvailabilityScenario = "persistent" | "recover-next-week";
export type Player = z.infer<typeof playerSchema>;
export type Fixture = z.infer<typeof fixtureSchema>;
export type Bootstrap = z.infer<typeof bootstrapSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Data = z.infer<typeof dataSchema>;
export type History = z.infer<typeof historySchema>["history"];
