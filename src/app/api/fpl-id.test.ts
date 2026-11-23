import { describe, expect, it } from "vitest";
import { idSchema } from "./fpl-id";
describe("FPL boundary", () => {
  it("rejects invalid IDs", () => {
    for (const id of ["", null, "abc", "1.5", "-1", "100000001"])
      expect(idSchema.safeParse(id).success).toBe(false);
  });
});
