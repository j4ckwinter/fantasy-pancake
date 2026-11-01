import { expect, it } from "vitest";
import { plannerDataExpired, PLANNER_DATA_MAX_AGE } from "./freshness";

it("expires a browser data cohort at five minutes", () => {
  const loadedAt = 1_000_000;
  expect(plannerDataExpired(loadedAt, loadedAt)).toBe(false);
  expect(
    plannerDataExpired(loadedAt, loadedAt + PLANNER_DATA_MAX_AGE - 1),
  ).toBe(false);
  expect(plannerDataExpired(loadedAt, loadedAt + PLANNER_DATA_MAX_AGE)).toBe(
    true,
  );
});

it("requires a reload before first use or after the clock moves backwards", () => {
  expect(plannerDataExpired(null, 100)).toBe(true);
  expect(plannerDataExpired(100, 99)).toBe(true);
});
