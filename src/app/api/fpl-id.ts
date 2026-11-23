import { z } from "zod";

const MAX_FPL_ID = 100_000_000;

export const idSchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(MAX_FPL_ID));
