import type { Settings } from "@/lib/schemas";

export const toMillions = (tenths: number) => tenths / 10;
export const fromMillions = (millions: number) => Math.round(millions * 10);

export const money = (value: number) => `£${toMillions(value).toFixed(1)}m`;
export const signed = (value: number) =>
  `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;

export const gameweekRange = (weeks: number[]) => {
  const first = weeks[0];
  const last = weeks.at(-1);
  return `GW${first}${last !== first ? `–${last}` : ""}`;
};

export const scoreGainLabel = (weeks: number[]) =>
  weeks.length ? `Score gain · ${gameweekRange(weeks)}` : "Score gain";

export const teamLabel = (settings: Pick<Settings, "teamName" | "entryId">) =>
  settings.teamName || `Team #${settings.entryId}`;
