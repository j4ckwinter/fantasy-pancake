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

const shownTenths = (value: number) =>
  Math.round(Number(value.toFixed(1)) * 10);

export const tenthsAddingUp = (parts: number[], total: number) => {
  let running = 0;
  let shown = 0;
  return parts.map((part, index) => {
    running += part;
    const cumulative = shownTenths(
      index === parts.length - 1 ? total : running,
    );
    const tenths = cumulative - shown;
    shown = cumulative;
    return tenths / 10;
  });
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
  `Gains are expected FPL points. Checked against GW${accuracy.firstValidationGameweek}–${accuracy.lastValidationGameweek} of ${accuracy.season} on ${measuredDate(accuracy.measuredOn)}, forecasts for players who played were off by ${expectedPoints(accuracy.meanAbsoluteErrorWhenPlaying)} a gameweek on average. Treat big gains with care: replaying the GW${accuracy.firstReplayDeadline}–${accuracy.lastReplayDeadline} deadlines, top transfers forecast ${signedPoints(accuracy.replayedTopTransferForecastGain)} over four gameweeks but realised ${signedPoints(accuracy.replayedTopTransferRealisedGain)} over holding, which is not reliably above zero.`;

export const planOptimismNote = (accuracy: ForecastAccuracy) =>
  `Plans run optimistic. Replaying the GW${accuracy.firstReplayDeadline}–${accuracy.lastReplayDeadline} deadlines of ${accuracy.season} on ${measuredDate(accuracy.measuredOn)}, the best single transfer forecast ${signedPoints(accuracy.replayedTopTransferForecastGain)} over four gameweeks and realised ${signedPoints(accuracy.replayedTopTransferRealisedGain)}. Several moves stack that optimism, so make this week's moves and rerun the plan next week.`;

export const teamLabel = (settings: Pick<Settings, "teamName" | "entryId">) =>
  settings.teamName || `Team #${settings.entryId}`;

export const freeTransfersLabel = (count: number) =>
  `${count} free transfer${count === 1 ? "" : "s"}`;

const tenths = (value: number) => Math.round(value * 10);

export const displayedLead = (leader: number, next: number) =>
  (tenths(leader) - tenths(next)) / 10;
