import { BookmarkIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import "./saved-plan-notice.css";

export function SavedPlanNotice({
  gameweek,
  busy,
  onRefresh,
}: {
  gameweek: number;
  busy: boolean;
  onRefresh: () => void;
}) {
  return (
    <aside className="saved-plan-notice" aria-label="Saved plan">
      <span className="saved-plan-notice__icon" aria-hidden="true">
        <BookmarkIcon className="size-4" />
      </span>
      <div className="saved-plan-notice__copy">
        <strong>Saved plan · GW{gameweek} picks</strong>
        <span>Check your bank and free transfers.</span>
      </div>
      <Button variant="outline" disabled={busy} onClick={onRefresh}>
        <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
        Refresh from FPL
      </Button>
    </aside>
  );
}
