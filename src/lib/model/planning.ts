import type { Data, Player, Settings } from "../schemas";
import type { Lineup, TransferPlan } from "./types";
import { bestLineup } from "./lineup";
import { excessClubIds } from "./squad-rules";

const round = (value: number) => Math.round(value * 100) / 100;

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
  for (const position of [1, 2, 3, 4]) {
    const eligible = data.bootstrap.elements.filter(
      (player) =>
        player.element_type === position &&
        !owned.has(player.id) &&
        player.can_select &&
        player.can_transact,
    );
    const best = [...eligible]
      .sort((a, b) => horizonScore(b) - horizonScore(a) || a.id - b.id)
      .slice(0, 4);
    const cheap = [...eligible]
      .sort(
        (a, b) =>
          a.now_cost - b.now_cost ||
          horizonScore(b) - horizonScore(a) ||
          a.id - b.id,
      )
      .slice(0, 2);
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
  const cap = 1 + data.bootstrap.game_settings.max_extra_free_transfers;
  const pairHit = 4 * Math.max(0, 2 - settings.freeTransfers);
  const deferredFreeTransfers = Math.min(cap, settings.freeTransfers + 1);
  const salePrice = new Map(
    settings.squad.map((pick) => [pick.id, pick.sellingPrice]),
  );
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
    settings.availabilityScenario === "recover-next-week"
      ? "Assumes injured, suspended and doubtful players recover from week two; this is a scenario, not a predicted return date."
      : "Assumes current availability persists; short absences could make this plan less attractive.",
    "Bounded search: four strongest and two cheapest candidates per position; this is not an exhaustive transfer plan.",
    "Uses today's purchase and selling prices throughout; confirm outgoing prices and recheck future prices before acting.",
    "No chips, further transfers, automatic substitutions or changing injury news are simulated.",
  ];
  for (let i = 0; i < squad.length; i++) {
    const outgoing = squad[i];
    if (settings.lockedPlayerIds?.includes(outgoing.id)) continue;
    for (const incoming of candidates.get(outgoing.element_type) ?? []) {
      const remainingBank =
        settings.bank + (salePrice.get(outgoing.id) ?? 0) - incoming.now_cost;
      if (weeks.length > 1 && remainingBank >= 0) {
        const changed = squad.map((player) =>
          player.id === outgoing.id ? incoming : player,
        );
        if (
          !excessClubIds(changed, data.bootstrap.game_settings.squad_team_limit)
            .length
        ) {
          const hit = 4 * Math.max(0, 1 - deferredFreeTransfers);
          keep({
            kind: "roll-then-transfer",
            actions: [
              { week: weeks[1], outId: outgoing.id, inId: incoming.id },
            ],
            gain: round(
              gains(changed)
                .slice(1)
                .reduce((sum, value) => sum + value, 0) - hit,
            ),
            hit,
            remainingBank,
            freeTransfersAfterPlan: Math.max(0, deferredFreeTransfers - 1),
            reasons: [
              `Keep your squad in GW${weeks[0]}, accrue one free transfer up to the ${cap}-transfer cap, then move in GW${weeks[1]}.`,
              "Gain compares the remaining horizon with keeping today's squad; the first gameweek contributes no change.",
              ...assumptions,
            ],
          });
        }
      }
      for (let j = i + 1; j < squad.length; j++) {
        const secondOutgoing = squad[j];
        if (settings.lockedPlayerIds?.includes(secondOutgoing.id)) continue;
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
          const pairBank =
            remainingBank +
            (salePrice.get(secondOutgoing.id) ?? 0) -
            secondIncoming.now_cost;
          if (pairBank < 0) continue;
          const changed = squad.map((player) =>
            player.id === outgoing.id
              ? incoming
              : player.id === secondOutgoing.id
                ? secondIncoming
                : player,
          );
          if (
            excessClubIds(
              changed,
              data.bootstrap.game_settings.squad_team_limit,
            ).length
          )
            continue;
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
            gain: round(
              gains(changed).reduce((sum, value) => sum + value, 0) - pairHit,
            ),
            hit: pairHit,
            remainingBank: pairBank,
            freeTransfersAfterPlan: Math.max(0, settings.freeTransfers - 2),
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
