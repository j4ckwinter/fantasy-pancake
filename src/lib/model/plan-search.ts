import type { Data, Player } from "../schemas";
import type { TransferAction } from "./types";
import { bestLineup } from "./lineup";
import {
  checkTransfers,
  type SquadState,
  type TransferRules,
} from "./transfer-legality";
import {
  freeTransfersLeft,
  nextWeekFreeTransfers,
  transferHit,
} from "./transfer-rules";
import { positionOf } from "./position";
import type { CandidatePool } from "./plan-candidates";

export const PLAN_BEAM_WIDTH = 6;
export const PAIR_SEED_SWAPS = 8;
export const PAIRS_EVALUATED_PER_STATE = 16;
export type WeekTransfers = 0 | 1 | 2;
export const WEEK_TRANSFER_CHOICES: readonly WeekTransfers[] = [0, 1, 2];
export const MAX_TRANSFERS_PER_WEEK = Math.max(...WEEK_TRANSFER_CHOICES);
export type PlanShape = readonly (readonly WeekTransfers[])[];

export type SearchSpace = {
  data: Data;
  weeks: number[];
  scores: ReadonlyMap<number, number>[];
  rules: TransferRules;
  start: SquadState;
  freeTransfers: number;
  cap: number;
  candidates: CandidatePool;
  margin: (transfers: number, freeTransfersBefore: number) => number;
};

export type PlanCandidate = {
  actions: TransferAction[];
  signature: string;
  value: number;
  margin: number;
  hit: number;
  transfers: number;
};

type Node = PlanCandidate & {
  moved: boolean;
  weekIndex: number;
  state: SquadState;
  freeTransfers: number;
  realised: number;
};

type Swap = Pick<TransferAction, "outId" | "inId">;

type SwapOption = { swap: Swap; delta: number; legal: SquadState | null };

type Scorer = {
  week: (squad: Player[], weekIndex: number) => number;
  from: (squad: Player[], weekIndex: number) => number;
};

export function adjustedValue(candidate: PlanCandidate): number {
  return candidate.value - candidate.margin;
}

export function compareCandidates(a: PlanCandidate, b: PlanCandidate) {
  return (
    adjustedValue(b) - adjustedValue(a) ||
    a.transfers - b.transfers ||
    firstMoveWeek(b) - firstMoveWeek(a) ||
    (a.signature < b.signature ? -1 : a.signature > b.signature ? 1 : 0)
  );
}

function firstMoveWeek(candidate: PlanCandidate): number {
  return candidate.actions[0]?.week ?? Infinity;
}

function squadKey(squad: Player[]): string {
  return squad
    .map((player) => player.id)
    .sort((a, b) => a - b)
    .join(",");
}

function holdScorer(space: SearchSpace): Scorer {
  const weekly = new Map<string, number>();
  const lineupScore = (squad: Player[], key: string, weekIndex: number) => {
    const cacheKey = `${weekIndex}|${key}`;
    const cached = weekly.get(cacheKey);
    if (cached !== undefined) return cached;
    const score = bestLineup(space.data, squad, space.scores[weekIndex]).score;
    weekly.set(cacheKey, score);
    return score;
  };
  return {
    week: (squad, weekIndex) => lineupScore(squad, squadKey(squad), weekIndex),
    from: (squad, weekIndex) => {
      const key = squadKey(squad);
      let total = 0;
      for (let index = weekIndex; index < space.weeks.length; index++)
        total += lineupScore(squad, key, index);
      return total;
    },
  };
}

function signatureOf(actions: TransferAction[]): string {
  return actions
    .map((action) => `${action.week}:${action.outId}>${action.inId}`)
    .join(",");
}

function swapOptions(space: SearchSpace, node: Node, hold: Scorer) {
  const { squad } = node.state;
  const owned = new Set(squad.map((player) => player.id));
  const current = hold.from(squad, node.weekIndex);
  const options: SwapOption[] = [];
  for (const outgoing of squad) {
    if (space.rules.lockedPlayerIds.includes(outgoing.id)) continue;
    for (const incoming of space.candidates[positionOf(outgoing)]) {
      if (owned.has(incoming.id)) continue;
      const swap = { outId: outgoing.id, inId: incoming.id };
      const swapped = squad.map((player) =>
        player.id === outgoing.id ? incoming : player,
      );
      const check = checkTransfers(space.rules, node.state, [swap]);
      options.push({
        swap,
        delta: hold.from(swapped, node.weekIndex) - current,
        legal: check.legal ? check.state : null,
      });
    }
  }
  return options;
}

function byPlayerIds(a: Swap, b: Swap): number {
  return a.outId - b.outId || a.inId - b.inId;
}

export function exchangedPlayers(swaps: readonly Swap[]): string {
  const ids = (pick: (swap: Swap) => number) =>
    swaps
      .map(pick)
      .sort((a, b) => a - b)
      .join(",");
  return `${ids((swap) => swap.outId)}>${ids((swap) => swap.inId)}`;
}

function bestPairs(
  space: SearchSpace,
  state: SquadState,
  options: SwapOption[],
): { swaps: Swap[]; state: SquadState }[] {
  const byDelta = [...options].sort(
    (a, b) =>
      b.delta - a.delta ||
      a.swap.outId - b.swap.outId ||
      a.swap.inId - b.swap.inId,
  );
  const seen = new Set<string>();
  const ranked: { swaps: Swap[]; estimate: number; key: string }[] = [];
  for (const seed of byDelta.slice(0, PAIR_SEED_SWAPS)) {
    for (const partner of byDelta) {
      if (
        partner.swap.outId === seed.swap.outId ||
        partner.swap.inId === seed.swap.inId
      )
        continue;
      const swaps = [seed.swap, partner.swap].sort(byPlayerIds);
      const key = exchangedPlayers(swaps);
      if (seen.has(key)) continue;
      seen.add(key);
      ranked.push({ swaps, estimate: seed.delta + partner.delta, key });
    }
  }
  ranked.sort((a, b) => b.estimate - a.estimate || (a.key < b.key ? -1 : 1));
  const pairs: { swaps: Swap[]; state: SquadState }[] = [];
  for (const { swaps } of ranked) {
    if (pairs.length >= PAIRS_EVALUATED_PER_STATE) break;
    const check = checkTransfers(space.rules, state, swaps);
    if (check.legal) pairs.push({ swaps, state: check.state });
  }
  return pairs;
}

function expand(
  space: SearchSpace,
  node: Node,
  allowed: readonly WeekTransfers[],
  hold: Scorer,
): Node[] {
  const weekIndex = node.weekIndex;
  const week = space.weeks[weekIndex];
  const before = node.freeTransfers;
  const child = (swaps: Swap[], state: SquadState): Node => {
    const hit = transferHit(swaps.length, before);
    const actions = [
      ...node.actions,
      ...swaps.map((swap) => ({ week, ...swap })),
    ];
    const realised = node.realised + hold.week(state.squad, weekIndex) - hit;
    return {
      moved: swaps.length > 0,
      weekIndex: weekIndex + 1,
      state,
      freeTransfers: nextWeekFreeTransfers(
        freeTransfersLeft(swaps.length, before),
        space.cap,
      ),
      realised,
      actions,
      signature: signatureOf(actions),
      value: realised + hold.from(state.squad, weekIndex + 1),
      margin: node.margin + space.margin(swaps.length, before),
      hit: node.hit + hit,
      transfers: node.transfers + swaps.length,
    };
  };
  const children: Node[] = [];
  if (allowed.includes(0)) children.push(child([], node.state));
  if (!allowed.includes(1) && !allowed.includes(2)) return children;
  const options = swapOptions(space, node, hold);
  if (allowed.includes(1))
    for (const option of options)
      if (option.legal) children.push(child([option.swap], option.legal));
  if (allowed.includes(2))
    for (const pair of bestPairs(space, node.state, options))
      children.push(child(pair.swaps, pair.state));
  return children;
}

function stateKey(node: Node): string {
  return `${squadKey(node.state.squad)}|${node.freeTransfers}|${node.state.bank}`;
}

function nextBeam(children: Node[]): Node[] {
  const unique = new Map<string, Node>();
  for (const node of children) {
    const key = stateKey(node);
    const previous = unique.get(key);
    if (!previous || compareCandidates(node, previous) < 0)
      unique.set(key, node);
  }
  const ranked = [...unique.values()].sort(compareCandidates);
  const kept = new Set(ranked.slice(0, PLAN_BEAM_WIDTH));
  for (const bucket of [
    (node: Node) => node.freeTransfers,
    (node: Node) => node.transfers,
  ]) {
    const seen = new Set<number>();
    for (const node of ranked)
      if (!seen.has(bucket(node))) {
        seen.add(bucket(node));
        kept.add(node);
      }
  }
  return ranked.filter((node) => kept.has(node));
}

export function searchPlans(
  space: SearchSpace,
  shape: PlanShape,
): PlanCandidate[] {
  const hold = holdScorer(space);
  const root: Node = {
    moved: false,
    weekIndex: 0,
    state: space.start,
    freeTransfers: space.freeTransfers,
    realised: 0,
    actions: [],
    signature: "",
    value: hold.from(space.start.squad, 0),
    margin: 0,
    hit: 0,
    transfers: 0,
  };
  const found: PlanCandidate[] = [];
  let beam = [root];
  for (let index = 0; index < space.weeks.length; index++) {
    const children = beam.flatMap((node) =>
      expand(space, node, shape[index] ?? [0], hold),
    );
    for (const node of children)
      if (node.moved)
        found.push({
          actions: node.actions,
          signature: node.signature,
          value: node.value,
          margin: node.margin,
          hit: node.hit,
          transfers: node.transfers,
        });
    beam = nextBeam(children);
  }
  return found;
}
