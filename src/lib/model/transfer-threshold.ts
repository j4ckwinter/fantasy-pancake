export const NET_GAIN_THRESHOLD_POINTS = 2;
export const AT_CAP_NET_GAIN_THRESHOLD_POINTS = 1;

export function transferThreshold(freeTransfers: number, cap: number): number {
  return freeTransfers >= cap
    ? AT_CAP_NET_GAIN_THRESHOLD_POINTS
    : NET_GAIN_THRESHOLD_POINTS;
}
