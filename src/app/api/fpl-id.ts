import { z } from "zod";

export const idSchema = z.coerce.number().int().min(1).max(100_000_000);
