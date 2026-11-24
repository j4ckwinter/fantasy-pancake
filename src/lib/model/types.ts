import type { Captaincy } from "./captaincy";

export type Lineup = { score: number; ids: number[]; captain: number };
export type Move = {
  outId: number;
  inId: number;
  cost: number;
  remainingBank: number;
  hit: number;
  gain: number;
  immediateGain: number;
  grossGain: number;
  gainPersistent?: number;
  gainRecovery?: number;
  reasons: string[];
  risks: string[];
  fixtures: string[];
};
export type TransferAction = { week: number; outId: number; inId: number };
export type PlanWeek = {
  week: number;
  actions: TransferAction[];
  hit: number;
  freeTransfersBefore: number;
  freeTransfersAfter: number;
  bank: number;
  score: number;
  gain: number;
};
export type PlanAccount = {
  actions: TransferAction[];
  weeks: PlanWeek[];
  gain: number;
  hit: number;
  remainingBank: number;
  freeTransfersAfterPlan: number;
};
export type PlanVariant =
  "best" | "no-hits" | "fewer-moves" | "bank-first" | "move-now";
export type PlanIdentity =
  | { kind: "plan-ahead"; variant: PlanVariant }
  | { kind: "pair-now" }
  | { kind: "roll-then-transfer" };
export type TransferPlan = PlanAccount & { reasons: string[] } & PlanIdentity;
export type Analysis = {
  weeks: number[];
  baseline: Lineup[];
  captaincy: Captaincy[];
  moves: Move[];
  plans: TransferPlan[];
  threshold: number;
  rollReason: string;
};
