import { Button, StatusChip } from "@jack.winter/pancake-ui";

export function RollOption({
  nextFreeTransfers,
  recommended,
  reason,
  onPreview,
}: {
  nextFreeTransfers: number;
  recommended: boolean;
  reason: string;
  onPreview: () => void;
}) {
  return (
    <article className="roll-option" aria-label="Keep your current squad">
      <div className="roll-option__row">
        <span className="roll-option__icon" aria-hidden="true">
          ↺
        </span>
        <div className="roll-option__copy">
          <h3>Roll the transfer</h3>
          <p>No hit · {nextFreeTransfers} free transfers next GW*</p>
        </div>
        {recommended && <StatusChip tone="success">Recommended</StatusChip>}
        <Button variant="secondary" onClick={onPreview}>
          View unchanged squad <span aria-hidden="true">→</span>
        </Button>
      </div>
      <details>
        <summary>Why keep your squad?</summary>
        <p>{reason}</p>
        <p>*Assumes normal weekly accrual and no other moves.</p>
      </details>
    </article>
  );
}
