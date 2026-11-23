import { Button } from "@jack.winter/pancake-ui";
import type { Data } from "@/lib/schemas";
import type { TransferPlan } from "@/lib/model";
import { planLabels, pricesChecked, type Selection } from "../selection";
import { findPlayer } from "../players";
import { PlayerLink } from "./player-link";
import { money, signed, scoreGainLabel } from "../format";
import "./transfer-plans.css";

export function TransferPlans({
  data,
  plans,
  weeks,
  confirmedPrices,
  selection,
  onSelect,
  onClearSelection,
  onPlayerSelect,
}: {
  data: Data;
  plans: TransferPlan[];
  weeks: number[];
  confirmedPrices: number[];
  selection: Selection | null;
  onSelect: (plan: TransferPlan) => void;
  onPlayerSelect: (id: number) => void;
  onClearSelection: () => void;
}) {
  const name = (id: number) =>
    findPlayer(data.bootstrap.elements, id)?.web_name ?? String(id);
  if (!plans.length)
    return (
      <p className="muted">
        No plan in this category clears the transfer threshold with your current
        settings and player locks.
      </p>
    );
  return (
    <div className="transfer-plan-grid">
      {plans.map((plan, index) => {
        const key = plan.actions
          .map((action) => `${action.week}-${action.outId}-${action.inId}`)
          .join("/");
        const selected =
          selection?.plan?.kind === plan.kind &&
          selection.actions
            .map((action) => `${action.week}-${action.outId}-${action.inId}`)
            .join("/") === key;
        const multipleWeeks =
          new Set(plan.actions.map((action) => action.week)).size > 1;
        const checked = pricesChecked(plan.actions, confirmedPrices);
        return (
          <article
            key={key}
            className={`card transfer-plan${selected ? " is-selected" : ""}`}
          >
            <div className="transfer-group-heading">
              <span className="option-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h3>{planLabels[plan.kind]}</h3>
                <p className="muted">
                  {plan.kind === "pair-now"
                    ? `GW${plan.actions[0]?.week}`
                    : `Hold in GW${weeks[0]} · move in GW${plan.actions[0]?.week}`}
                </p>
              </div>
            </div>
            <ol className={multipleWeeks ? "plan-multiple-weeks" : undefined}>
              {plan.actions.map((action) => (
                <li key={`${action.week}-${action.outId}-${action.inId}`}>
                  {multipleWeeks && (
                    <span className="plan-week">GW{action.week}</span>
                  )}
                  <div>
                    <span className="eyebrow">Sell</span>
                    <PlayerLink
                      className="player-detail-link"
                      playerId={action.outId}
                      onSelect={onPlayerSelect}
                    >
                      {name(action.outId)}
                    </PlayerLink>
                  </div>
                  <span className="plan-arrow" aria-hidden="true">
                    →
                  </span>
                  <div>
                    <span className="eyebrow">Buy</span>
                    <PlayerLink
                      className="player-detail-link"
                      playerId={action.inId}
                      onSelect={onPlayerSelect}
                    >
                      {name(action.inId)}
                    </PlayerLink>
                  </div>
                </li>
              ))}
            </ol>
            <div className="plan-outcome">
              <div className="alternative-gain">
                <strong>{signed(plan.gain)}</strong>
                <span>{scoreGainLabel(weeks)}</span>
              </div>
              <div className="plan-cost">
                <span className="plan-cost__balance">
                  <strong
                    className={plan.hit > 0 ? "plan-cost__hit" : undefined}
                  >
                    {plan.hit > 0 ? `−${plan.hit} pts hit` : "No hit"}
                  </strong>
                  <span> · {money(plan.remainingBank)} left</span>
                </span>
                <span>
                  {plan.freeTransfersAfterPlan} FT after moves
                  {checked ? " · Prices checked" : ""}
                </span>
              </div>
              <Button
                variant="secondary"
                className="preview-toggle"
                aria-pressed={selected}
                onClick={() => (selected ? onClearSelection() : onSelect(plan))}
              >
                {selected ? "Selected" : "Preview plan"}
              </Button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
