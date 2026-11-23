import { describe, expect, it } from "vitest";
import { idSchema } from "./fpl-id";
describe("FPL boundary", () => {
  it("rejects invalid IDs", () => {
    for (const id of ["", null, "abc", "1.5", "-1", "100000001"])
      expect(idSchema.safeParse(id).success).toBe(false);
  });
  it("accepts only plain decimal digits", () => {
    for (const id of ["0x10", "1e3", " 5 ", "5 ", "+5", "0"])
      expect(idSchema.safeParse(id).success).toBe(false);
    expect(idSchema.parse("5")).toBe(5);
    expect(idSchema.parse("100000000")).toBe(100_000_000);
  });
});
