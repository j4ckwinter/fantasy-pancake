import type { AvailabilityScenario, Data, Player } from "../schemas";
import { availability, expectedMinutes } from "./scoring";
import { roundScore } from "./round-score";

const KEEP_SCORE_SCENARIO_LABEL: Record<AvailabilityScenario, string> = {
  persistent: "persistent absence",
  "recover-next-week": "recovery from the second week",
};
const FIRST_IN_ORDER = 1;

export function transferReasons(
  data: Data,
  scenario: AvailabilityScenario,
  outgoing: Player,
  incoming: Player,
  grossGain: number,
  weekCount: number,
): string[] {
  const reasons = [
    `Changes the optimised starting XI and captain total by ${roundScore(grossGain)} score units across ${weekCount} gameweeks before the hit.`,
    `${Math.round(expectedMinutes(data, incoming))} estimated minutes per match from recent history where available, blended with season usage; venue and opponent strengths adjust attacking and clean-sheet scores.`,
  ];
  if (incoming.penalties_order === FIRST_IN_ORDER)
    reasons.push(
      "Listed first for penalties; this role is already reflected in underlying attacking data, so receives no extra bonus.",
    );
  if (
    incoming.corners_and_indirect_freekicks_order === FIRST_IN_ORDER ||
    incoming.direct_freekicks_order === FIRST_IN_ORDER
  )
    reasons.push(
      "Listed first for a set-piece duty; role context, not an additional scoring bonus.",
    );
  if (availability(outgoing) < 1)
    reasons.push(
      `${outgoing.web_name}'s availability affects the keep score under the selected ${KEEP_SCORE_SCENARIO_LABEL[scenario]} scenario; no return date is inferred.`,
    );
  return reasons;
}
