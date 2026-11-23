import { describe, expect, it } from "vitest";
import {
  displayedLead,
  expectedPoints,
  freeTransfersLabel,
  signed,
} from "./format";

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

describe("free transfer counts", () => {
  it("uses the singular for one transfer and the plural otherwise", () => {
    expect(freeTransfersLabel(1)).toBe("1 free transfer");
    expect(freeTransfersLabel(0)).toBe("0 free transfers");
    expect(freeTransfersLabel(2)).toBe("2 free transfers");
  });
});

describe("expected points", () => {
  it("shows one decimal with the app's unit wording", () => {
    expect(expectedPoints(7.36)).toBe("7.4 units");
    expect(expectedPoints(0)).toBe("0.0 units");
  });
});

describe("captain lead", () => {
  it("measures the lead between the numbers people see", () => {
    expect(displayedLead(7.36, 7.34)).toBe(0.1);
    expect(displayedLead(7.32, 7.34)).toBe(0);
    expect(displayedLead(7.44, 7.25)).toBe(0.1);
    expect(displayedLead(7.7, 3.8)).toBe(3.9);
  });
});
