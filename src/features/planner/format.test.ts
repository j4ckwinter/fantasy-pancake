import { describe, expect, it } from "vitest";
import {
  accuracyNote,
  displayedLead,
  expectedGainLabel,
  expectedPoints,
  freeTransfersLabel,
  signed,
  signedPoints,
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
  it("shows one decimal in points", () => {
    expect(expectedPoints(7.36)).toBe("7.4 pts");
    expect(expectedPoints(0)).toBe("0.0 pts");
  });

  it("labels gains and thresholds in points", () => {
    expect(signedPoints(3.44)).toBe("+3.4 pts");
    expect(signedPoints(-0.96)).toBe("−1.0 pts");
    expect(expectedPoints(2)).toBe("2.0 pts");
    expect(expectedGainLabel([9, 10, 11, 12])).toBe("Expected gain · GW9–12");
    expect(expectedGainLabel([])).toBe("Expected gain");
  });

  it("dates and quotes the measured forecast error", () => {
    expect(
      accuracyNote({
        measuredOn: "2026-11-23",
        season: "2026/27",
        firstValidationGameweek: 7,
        lastValidationGameweek: 10,
        meanAbsoluteErrorWhenPlaying: 1.9,
        replayedTopTransferForecastGain: 7.6,
        replayedTopTransferRealisedGain: 1.4,
      }),
    ).toBe(
      "Gains are expected FPL points. Checked against GW7–10 of 2026/27 on 23 Nov 2026, a player who played finished 1.9 pts from the forecast in a typical gameweek. Big gains run optimistic: replayed top transfers forecast +7.6 pts and realised +1.4 pts.",
    );
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
