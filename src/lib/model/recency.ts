const RECENCY_HALF_LIFE_MATCHES = 3;

export function recencyWeight(matchesAgo: number): number {
  return 2 ** (-matchesAgo / RECENCY_HALF_LIFE_MATCHES);
}
