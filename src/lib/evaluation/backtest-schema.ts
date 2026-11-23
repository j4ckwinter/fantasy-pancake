import { z } from "zod";
import { bootstrapSchema, fixtureSchema, historySchema } from "../schemas";

const count = z.number().int().nonnegative();
const numeric = z
  .union([z.string().regex(/^-?\d+(\.\d+)?$/), z.number().finite()])
  .transform(Number);

export const archiveRowSchema = historySchema.shape.history.element.extend({
  value: count,
  selected: count,
  creativity: numeric,
});

export const seasonArchiveSchema = z.object({
  bootstrap: bootstrapSchema,
  fixtures: z.array(fixtureSchema),
  histories: z.record(z.string(), z.array(archiveRowSchema)),
});

export type ArchiveRow = z.infer<typeof archiveRowSchema>;
export type SeasonArchive = z.infer<typeof seasonArchiveSchema>;
