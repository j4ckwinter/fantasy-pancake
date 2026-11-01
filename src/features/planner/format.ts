export const money = (value: number) => `£${(value / 10).toFixed(1)}m`;
export const signed = (value: number) =>
  `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;

export const scoreGainLabel = (weeks: number[]) => {
  if (!weeks.length) return "Score gain";
  const first = weeks[0];
  const last = weeks.at(-1);
  return `Score gain · GW${first}${last !== first ? `–${last}` : ""}`;
};
