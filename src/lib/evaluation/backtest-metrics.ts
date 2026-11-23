export type Pair = { predicted: number; actual: number };

export function meanAbsoluteError(pairs: readonly Pair[]): number {
  if (!pairs.length) return NaN;
  return (
    pairs.reduce(
      (sum, pair) => sum + Math.abs(pair.predicted - pair.actual),
      0,
    ) / pairs.length
  );
}

export function bias(pairs: readonly Pair[]): number {
  if (!pairs.length) return NaN;
  return (
    pairs.reduce((sum, pair) => sum + pair.predicted - pair.actual, 0) /
    pairs.length
  );
}

function averageRanks(values: readonly number[]): number[] {
  const order = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const ranks = new Array<number>(values.length);
  for (let start = 0; start < order.length;) {
    let end = start;
    while (
      end + 1 < order.length &&
      order[end + 1].value === order[start].value
    )
      end++;
    const rank = (start + end) / 2 + 1;
    for (let item = start; item <= end; item++) ranks[order[item].index] = rank;
    start = end + 1;
  }
  return ranks;
}

function pearson(xs: readonly number[], ys: readonly number[]): number {
  const n = xs.length;
  const meanX = xs.reduce((sum, x) => sum + x, 0) / n;
  const meanY = ys.reduce((sum, y) => sum + y, 0) / n;
  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;
  for (let index = 0; index < n; index++) {
    const dx = xs[index] - meanX;
    const dy = ys[index] - meanY;
    covariance += dx * dy;
    varianceX += dx * dx;
    varianceY += dy * dy;
  }
  return varianceX && varianceY
    ? covariance / Math.sqrt(varianceX * varianceY)
    : NaN;
}

export function spearman(pairs: readonly Pair[]): number {
  if (pairs.length < 2) return NaN;
  return pearson(
    averageRanks(pairs.map((pair) => pair.predicted)),
    averageRanks(pairs.map((pair) => pair.actual)),
  );
}

type Ranked = Pair & { id: number };

export function topHitRate(items: readonly Ranked[], size: number): number {
  const count = Math.min(size, items.length);
  if (!count) return NaN;
  const cutoff = items.map((item) => item.actual).sort((a, b) => b - a)[
    count - 1
  ];
  const picked = [...items]
    .sort((a, b) => b.predicted - a.predicted || a.id - b.id)
    .slice(0, count);
  return picked.filter((item) => item.actual >= cutoff).length / count;
}
