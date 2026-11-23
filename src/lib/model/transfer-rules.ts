import type { Data } from "../schemas";

type GameSettings = Data["bootstrap"]["game_settings"];

export const TRANSFER_HIT_POINTS = 4;

export function freeTransferCap(
  gameSettings: Pick<GameSettings, "max_extra_free_transfers">,
): number {
  return 1 + gameSettings.max_extra_free_transfers;
}

export function nextWeekFreeTransfers(
  freeTransfers: number,
  cap: number,
): number {
  return Math.min(cap, freeTransfers + 1);
}

export function transferHit(transfers: number, freeTransfers: number): number {
  return TRANSFER_HIT_POINTS * Math.max(0, transfers - freeTransfers);
}

export function freeTransfersLeft(
  transfers: number,
  freeTransfers: number,
): number {
  return Math.max(0, freeTransfers - transfers);
}
