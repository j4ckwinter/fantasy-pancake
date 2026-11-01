import { Button } from "@jack.winter/pancake-ui";
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
      <div>
        <strong>Saved plan · GW{gameweek} picks</strong>
        <span>Check your bank and free transfers.</span>
      </div>
      <Button variant="secondary" disabled={busy} onClick={onRefresh}>
        Refresh from FPL
      </Button>
    </aside>
  );
}
