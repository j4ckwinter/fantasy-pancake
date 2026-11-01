export const PLANNER_DATA_MAX_AGE = 5 * 60 * 1000;

export function plannerDataExpired(loadedAt: number | null, now = Date.now()) {
  return (
    loadedAt === null ||
    now < loadedAt ||
    now - loadedAt >= PLANNER_DATA_MAX_AGE
  );
}
