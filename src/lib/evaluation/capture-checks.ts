import type { Data } from "../schemas";
import { upcomingWeeks } from "../model";

export function assertPreDeadline(data: Data, capturedAt: string): number[] {
  const capture = Date.parse(capturedAt);
  const fetched = Date.parse(data.fetchedAt);
  const weeks = upcomingWeeks(data);
  const deadline = data.bootstrap.events.find(
    (event) => event.id === weeks[0],
  )?.deadline_time;
  if (
    !deadline ||
    !Number.isFinite(Date.parse(deadline)) ||
    capture >= Date.parse(deadline)
  ) {
    throw new Error("Capture a snapshot before the first target deadline.");
  }
  if (!Number.isFinite(fetched) || fetched > capture)
    throw new Error("Snapshot data cannot be fetched after capture.");
  for (const rows of Object.values(data.histories ?? {})) {
    for (const row of rows) {
      if (
        !Number.isFinite(Date.parse(row.kickoff_time)) ||
        Date.parse(row.kickoff_time) >= capture ||
        row.round >= weeks[0]
      ) {
        throw new Error(
          "Snapshot history contains future or target-gameweek outcomes.",
        );
      }
    }
  }
  return weeks;
}
