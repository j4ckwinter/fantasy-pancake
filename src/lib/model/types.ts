export type Lineup = { score: number; ids: number[]; captain: number | null };
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
export type TransferPlan = {
  kind: "pair-now" | "roll-then-transfer";
  actions: TransferAction[];
  gain: number;
  hit: number;
  remainingBank: number;
  freeTransfersAfterPlan: number;
  reasons: string[];
};
export type Analysis = {
  weeks: number[];
  baseline: Lineup[];
  moves: Move[];
  plans?: TransferPlan[];
  threshold: number;
  rollReason: string;
};
