import { describe, expect, it } from "vitest";
import { settingsSchema } from "./schemas";
import { seasonContext } from "./model/test-fixtures";

describe("saved settings", () => {
  it("preserves old settings and validates unique positive locks", () => {
    const { settings } = seasonContext();
    expect(settingsSchema.parse(settings).lockedPlayerIds).toBeUndefined();
    expect(
      settingsSchema.safeParse({ ...settings, lockedPlayerIds: [8, 9] })
        .success,
    ).toBe(true);
    for (const lockedPlayerIds of [[8, 8], [0], [-1], [1.5]])
      expect(
        settingsSchema.safeParse({ ...settings, lockedPlayerIds }).success,
      ).toBe(false);
  });
});
