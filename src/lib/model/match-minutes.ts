export const FULL_MATCH_MINUTES = 90;
export const LONG_APPEARANCE_MINUTES = 60;

export function fullMatches(minutes: number): number {
  return minutes / FULL_MATCH_MINUTES;
}
