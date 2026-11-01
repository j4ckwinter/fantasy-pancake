import type { Data, Settings } from "@/lib/schemas";
import type { Analysis } from "@/lib/model";
import { createSnapshot } from "@/lib/evaluation";

export function downloadSnapshot(
  data: Data,
  settings: Settings,
  analysis: Analysis,
  confirmedPrices: number[],
) {
  const snapshot = createSnapshot(data, settings, analysis, confirmedPrices);
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `fpl-evaluation-gw${analysis.weeks[0]}-${Date.now()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
