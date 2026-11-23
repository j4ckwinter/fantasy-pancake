import { describe, expect, it } from "vitest";
import { signed } from "./format";

describe("formatting", () => {
  it("signs gains with a plus and losses with a true minus", () => {
    expect(signed(2.34)).toBe("+2.3");
    expect(signed(-1.26)).toBe("−1.3");
  });

  it("shows a gain that rounds to zero as +0.0", () => {
    expect(signed(0)).toBe("+0.0");
    expect(signed(-0.04)).toBe("+0.0");
  });
});
