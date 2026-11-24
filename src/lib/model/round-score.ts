export function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

export function roundScoreParts(values: number[]): number[] {
  let total = 0;
  let reported = 0;
  return values.map((value) => {
    total += value;
    const cumulative = Math.round(total * 100);
    const part = cumulative - reported;
    reported = cumulative;
    return part / 100;
  });
}
