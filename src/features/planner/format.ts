import type { ForecastAccuracy } from "@/lib/model";
import type { Settings } from "@/lib/schemas";

export const toMillions = (tenths: number) => tenths / 10;
export const fromMillions = (millions: number) => Math.round(millions * 10);

export const money = (value: number) => `£${toMillions(value).toFixed(1)}m`;
export const minus = "−";

export const signed = (value: number) => {
  const rounded = Math.abs(value).toFixed(1);
  return `${Number(rounded) === 0 || value > 0 ? "+" : minus}${rounded}`;
};

export const expectedPoints = (value: number) => `${value.toFixed(1)} pts`;

export const signedPoints = (value: number) => `${signed(value)} pts`;

export const gameweekRange = (weeks: number[]) => {
  const first = weeks[0];
  const last = weeks.at(-1);
  return `GW${first}${last !== first ? `–${last}` : ""}`;
};

export const expectedGainLabel = (weeks: number[]) =>
  weeks.length ? `Expected gain · ${gameweekRange(weeks)}` : "Expected gain";

const measuredDate = (isoDate: string) =>
  new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

export const accuracyNote = (accuracy: ForecastAccuracy) =>
  `Gains are expected FPL points. Checked against GW${accuracy.firstValidationGameweek}–${accuracy.lastValidationGameweek} of ${accuracy.season} on ${measuredDate(accuracy.measuredOn)}, a player who played finished ${expectedPoints(accuracy.meanAbsoluteErrorWhenPlaying)} from the forecast in a typical gameweek. Big gains run optimistic: replayed top transfers forecast ${signedPoints(accuracy.replayedTopTransferForecastGain)} and realised ${signedPoints(accuracy.replayedTopTransferRealisedGain)}.`;

export const teamLabel = (settings: Pick<Settings, "teamName" | "entryId">) =>
  settings.teamName || `Team #${settings.entryId}`;

export const freeTransfersLabel = (count: number) =>
  `${count} free transfer${count === 1 ? "" : "s"}`;

const tenths = (value: number) => Math.round(value * 10);

export const displayedLead = (leader: number, next: number) =>
  (tenths(leader) - tenths(next)) / 10;
