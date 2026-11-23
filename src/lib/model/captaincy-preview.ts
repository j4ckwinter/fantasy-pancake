import type { Data, Settings } from "../schemas";
import type { TransferAction } from "./types";
import { weekCaptaincy, type Captaincy } from "./captaincy";
import { playChance } from "./play-chance";
import {
  previewWeeks,
  transferContext,
  type PreviewedWeek,
  type TransferContext,
} from "./transfer-preview";

export function captaincyByWeek(
  context: TransferContext,
  previewed: PreviewedWeek[],
): Captaincy[] {
  const { data, settings, weeks, scores } = context;
  return previewed.map(({ squad, lineup }, index) =>
    weekCaptaincy(data, squad, lineup, {
      week: weeks[index],
      expectedPoints: scores[index],
      playChance: new Map(
        squad.map((player) => [
          player.id,
          playChance(data, player, weeks[index], settings.availabilityScenario),
        ]),
      ),
    }),
  );
}

export function previewCaptaincy(
  data: Data,
  settings: Settings,
  actions: TransferAction[],
): Captaincy[] {
  const context = transferContext(data, settings);
  return captaincyByWeek(context, previewWeeks(context, actions));
}
