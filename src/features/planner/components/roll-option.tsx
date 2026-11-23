import { ArrowRightIcon, ChevronRightIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { freeTransfersLabel } from "../format";
import "./roll-option.css";

export function RollOption({
  nextFreeTransfers,
  reason,
  onPreview,
}: {
  nextFreeTransfers: number;
  reason: string;
  onPreview: () => void;
}) {
  return (
    <article className="roll-option" aria-label="Keep your current squad">
      <div className="roll-option__row">
        <span className="roll-option__icon" aria-hidden="true">
          <RotateCcwIcon className="size-4" />
        </span>
        <div className="roll-option__copy">
          <h3>Roll the transfer</h3>
          <p>No hit · {freeTransfersLabel(nextFreeTransfers)} next GW*</p>
        </div>
        <StatusBadge tone="success">Recommended</StatusBadge>
        <Button variant="outline" onClick={onPreview}>
          View unchanged squad
          <ArrowRightIcon aria-hidden="true" className="size-4" />
        </Button>
      </div>
      <details>
        <summary>
          <ChevronRightIcon
            aria-hidden="true"
            className="roll-option__chevron size-4"
          />
          Why keep your squad?
        </summary>
        <p>{reason}</p>
        <p>*Assumes normal weekly accrual and no other moves.</p>
      </details>
    </article>
  );
}
