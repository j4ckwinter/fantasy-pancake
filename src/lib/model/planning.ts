import type { AvailabilityScenario, Data, Player, Settings } from "../schemas";
import type { Lineup, TransferPlan } from "./types";
import { bestLineup } from "./lineup";
import {
  checkTransfers,
  isTransferable,
  startingState,
  transferRules,
} from "./transfer-legality";
import { roundScore } from "./round-score";
import {
  freeTransferCap,
  freeTransfersLeft,
  nextWeekFreeTransfers,
  transferHit,
} from "./transfer-rules";
import { DEFAULT_AVAILABILITY_SCENARIO } from "./scoring";
import { POSITIONS } from "./position";

const STRONG_CANDIDATES_PER_POSITION = 4;
const CHEAP_CANDIDATES_PER_POSITION = 2;
const SCENARIO_ASSUMPTION: Record<AvailabilityScenario, string> = {
  persistent:
    "Assumes current availability persists; short absences could make this plan less attractive.",
  "recover-next-week":
    "Assumes injured, suspended and doubtful players recover from week two; this is a scenario, not a predicted return date.",
};

export function planTransfers(
  data: Data,
  settings: Settings,
  weeks: number[],
  squad: Player[],
  scores: ReadonlyMap<number, number>[],
  baseline: Lineup[],
  threshold: number,
): TransferPlan[] {
  if (!weeks.length) return [];
  const owned = new Set(squad.map((player) => player.id));
  const horizonScore = (player: Player) =>
    scores.reduce((sum, week) => sum + (week.get(player.id) ?? 0), 0);
  const candidates = new Map<number, Player[]>();
  for (const position of POSITIONS) {
    const eligible = data.bootstrap.elements.filter(
      (player) =>
        player.element_type === position &&
        !owned.has(player.id) &&
        isTransferable(player),
    );
    const best = [...eligible]
      .sort((a, b) => horizonScore(b) - horizonScore(a) || a.id - b.id)
      .slice(0, STRONG_CANDIDATES_PER_POSITION);
    const cheap = [...eligible]
      .sort(
        (a, b) =>
          a.now_cost - b.now_cost ||
          horizonScore(b) - horizonScore(a) ||
          a.id - b.id,
      )
      .slice(0, CHEAP_CANDIDATES_PER_POSITION);
    candidates.set(position, [
      ...new Map([...best, ...cheap].map((p) => [p.id, p])).values(),
    ]);
  }
  const lineupCache = new Map<string, number[]>();
  function gains(changed: Player[]): number[] {
    const key = changed
      .map((player) => player.id)
      .sort((a, b) => a - b)
      .join(",");
    const cached = lineupCache.get(key);
    if (cached) return cached;
    const values = scores.map(
      (week, index) =>
        bestLineup(data, changed, week).score - baseline[index].score,
    );
    lineupCache.set(key, values);
    return values;
  }
  const cap = freeTransferCap(data.bootstrap.game_settings);
  const pairHit = transferHit(2, settings.freeTransfers);
  const deferredFreeTransfers = nextWeekFreeTransfers(
    settings.freeTransfers,
    cap,
  );
  const rules = transferRules(data, settings);
  const start = startingState(settings, squad);
  const bestPlans = new Map<TransferPlan["kind"], TransferPlan>();
  const planKey = (plan: TransferPlan) =>
    plan.actions.map((action) => `${action.outId}:${action.inId}`).join(",");
  function keep(plan: TransferPlan) {
    if (plan.gain <= threshold) return;
    const previous = bestPlans.get(plan.kind);
    if (
      !previous ||
      plan.gain > previous.gain ||
      (plan.gain === previous.gain && planKey(plan) < planKey(previous))
    ) {
      bestPlans.set(plan.kind, plan);
    }
  }
  const assumptions = [
    SCENARIO_ASSUMPTION[
      settings.availabilityScenario ?? DEFAULT_AVAILABILITY_SCENARIO
    ],
    "Bounded search: four strongest and two cheapest candidates per position; this is not an exhaustive transfer plan.",
    "Uses today's purchase and selling prices throughout; confirm outgoing prices and recheck future prices before acting.",
    "No chips, further transfers, automatic substitutions or changing injury news are simulated.",
  ];
  for (let i = 0; i < squad.length; i++) {
    const outgoing = squad[i];
    for (const incoming of candidates.get(outgoing.element_type) ?? []) {
      const single = checkTransfers(rules, start, [
        { outId: outgoing.id, inId: incoming.id },
      ]);
      if (weeks.length > 1 && single.legal) {
        const { squad: changed, bank: remainingBank } = single.state;
        const hit = transferHit(1, deferredFreeTransfers);
        keep({
          kind: "roll-then-transfer",
          actions: [{ week: weeks[1], outId: outgoing.id, inId: incoming.id }],
          gain: roundScore(
            gains(changed)
              .slice(1)
              .reduce((sum, value) => sum + value, 0) - hit,
          ),
          hit,
          remainingBank,
          freeTransfersAfterPlan: freeTransfersLeft(1, deferredFreeTransfers),
          reasons: [
            `Keep your squad in GW${weeks[0]}, accrue one free transfer up to the ${cap}-transfer cap, then move in GW${weeks[1]}.`,
            "Gain compares the remaining horizon with keeping today's squad; the first gameweek contributes no change.",
            ...assumptions,
          ],
        });
      }
      for (let j = i + 1; j < squad.length; j++) {
        const secondOutgoing = squad[j];
        for (const secondIncoming of candidates.get(
          secondOutgoing.element_type,
        ) ?? []) {
          if (incoming.id === secondIncoming.id) continue;
          // Same-position assignments with identical bought/sold sets are equivalent.
          if (
            outgoing.element_type === secondOutgoing.element_type &&
            incoming.id > secondIncoming.id
          )
            continue;
          const pair = checkTransfers(rules, start, [
            { outId: outgoing.id, inId: incoming.id },
            { outId: secondOutgoing.id, inId: secondIncoming.id },
          ]);
          if (!pair.legal) continue;
          const { squad: changed, bank: pairBank } = pair.state;
          keep({
            kind: "pair-now",
            actions: [
              { week: weeks[0], outId: outgoing.id, inId: incoming.id },
              {
                week: weeks[0],
                outId: secondOutgoing.id,
                inId: secondIncoming.id,
              },
            ],
            gain: roundScore(
              gains(changed).reduce((sum, value) => sum + value, 0) - pairHit,
            ),
            hit: pairHit,
            remainingBank: pairBank,
            freeTransfersAfterPlan: freeTransfersLeft(
              2,
              settings.freeTransfers,
            ),
            reasons: [
              "Two simultaneous transfers use the combined sale proceeds; a cheaper replacement can fund the other move.",
              "Free transfers shown are those left immediately after the two moves, before next week's accrual.",
              ...assumptions,
            ],
          });
        }
      }
    }
  }
  return [...bestPlans.values()].sort(
    (a, b) => b.gain - a.gain || a.kind.localeCompare(b.kind),
  );
}
