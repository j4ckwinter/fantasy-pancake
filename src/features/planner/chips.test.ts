import { describe, expect, it } from "vitest";
import type { ChipStatus, ChipWeek } from "@/lib/model";
import type { ChipName } from "@/lib/schemas";
import { chipHorizonNote, chipOptimismNote, chipSummaries } from "./chips";

function option(week: number, gain: number, last = week): ChipWeek {
  return {
    week,
    coveredWeeks: Array.from({ length: last - week + 1 }, (_, i) => week + i),
    gain,
    lineup: { score: 0, ids: [], captain: 0 },
    bench: [],
  };
}

function held(
  chip: ChipName,
  best: ChipWeek,
  lastWeek: number,
  expires: boolean,
): ChipStatus {
  return {
    status: "available",
    chip,
    window: { firstWeek: 1, lastWeek },
    weeks: [12, 13, 14, 15],
    expires,
    valuation: {
      kind: "valued",
      threshold: 20,
      options: [best],
      best,
      recommendation: { kind: "hold", reason: "below-threshold" },
    },
  };
}

const detail = (row: ChipStatus) =>
  chipSummaries({ status: "known", weeks: [12, 13, 14, 15], chips: [row] })[0]
    .detail;

describe("chip advice wording", () => {
  it("says an expiring chip gains nothing worth playing rather than quoting a bar", () => {
    const text = detail(held("freehit", option(13, 0.04), 14, true));
    expect(text).toContain("Expires after GW14");
    expect(text).toMatch(/gains nothing worth playing/i);
    expect(text).not.toContain("bar");
  });

  it("says plainly when a Wildcard doesn't beat your plan", () => {
    const text = detail(held("wildcard", option(12, 0, 15), 19, false));
    expect(text).toContain("Doesn’t beat your recommended plan over GW12–15.");
    expect(text).not.toContain("+0.0");
  });

  it("covers the Wildcard and the plan in the panel's notes", () => {
    expect(chipOptimismNote()).toContain("Free Hit and Wildcard");
    expect(chipHorizonNote([12, 13, 14, 15])).toContain("recommended plan");
  });
});
