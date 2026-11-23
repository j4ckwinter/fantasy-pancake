import { analyze } from "@/lib/model";
import { settingsSchema, type Data, type Settings } from "@/lib/schemas";
import { loadPlayerHistories } from "./api";
import { historyCandidates } from "./history-candidates";

export async function prepareComparison(data: Data, settings: Settings) {
  const parsed = settingsSchema.parse(settings);
  const enriched = await loadPlayerHistories(
    data,
    historyCandidates(data, parsed),
  );
  return {
    data: enriched.data,
    settings: parsed,
    result: analyze(enriched.data, parsed),
  };
}
