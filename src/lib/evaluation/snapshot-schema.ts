import { z } from "zod";
import {
  STARTING_XI_SIZE,
  dataSchema,
  fixtureSchema,
  historySchema,
  settingsSchema,
} from "../schemas";

export const ROLL_POLICY_ID = "roll";

const actionSchema = z.object({
  week: z.number().int(),
  outId: z.number().int(),
  inId: z.number().int(),
});
const frozenLineupSchema = z.object({
  week: z.number().int(),
  ids: z.array(z.number().int()).length(STARTING_XI_SIZE),
  captain: z.number().int(),
});
const policySchema = z.object({
  id: z.string(),
  label: z.string(),
  hit: z.number().int().nonnegative(),
  actions: z.array(actionSchema),
  sellingPricesConfirmed: z.boolean(),
  lineups: z.array(frozenLineupSchema),
  historyCoverage: z.number().min(0).max(1).nullable(),
});
export const snapshotSchema = z.object({
  version: z.literal(1),
  modelVersion: z.string(),
  capturedAt: z.iso.datetime(),
  data: dataSchema,
  settings: settingsSchema,
  confirmedSellingPriceIds: z.array(z.number().int().positive()),
  policies: z.array(policySchema).min(1),
});
export const outcomesSchema = z.object({
  histories: z.record(z.string(), historySchema.shape.history),
  fixtures: z.array(fixtureSchema),
  completedGameweeks: z.array(z.number().int()),
});

export type EvaluationSnapshot = z.infer<typeof snapshotSchema>;
export type FrozenPolicy = z.infer<typeof policySchema>;
export type FrozenLineup = z.infer<typeof frozenLineupSchema>;
export type Action = z.infer<typeof actionSchema>;
