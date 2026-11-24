import { useEffect, type RefObject } from "react";
import { ChevronRightIcon } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Disclosure } from "@/components/disclosure";
import type { Lineup } from "@/lib/model";
import { WeeklyBreakdown } from "./weekly-breakdown";
import { PlayerComparison } from "./player-comparison";
import type { Data, Settings } from "@/lib/schemas";
import { pricesChecked, selectedOption, type Selection } from "../selection";
import { findPlayer } from "../players";
import { expectedPoints, signedPoints } from "../format";
import { SellingPriceCheck } from "./selling-price-check";
import { priceConfirmed as priceConfirmedMessage } from "../messages";
import "./selected-option.css";

export function SelectedOption({
  detailsRef,
  data,
  settings,
  selection,
  weeks,
  baseline,
  preview,
  threshold,
  previewError,
  priceConfirmed,
  confirmedPrices,
  onConfirmPrice,
}: {
  detailsRef: RefObject<HTMLDetailsElement | null>;
  weeks: number[];
  baseline: Lineup[];
  preview: Lineup[] | null;
  data: Data;
  settings: Settings;
  selection: Selection;
  threshold: number;
  previewError: string;
  priceConfirmed: boolean;
  confirmedPrices: number[];
  onConfirmPrice: (id: number, price: number) => void;
}) {
  useEffect(() => {
    if (previewError && detailsRef.current) detailsRef.current.open = true;
  }, [previewError, detailsRef]);
  const option = selectedOption(selection);
  const outgoingIds = [
    ...new Set(selection.actions.map((action) => action.outId)),
  ];
  const checked = pricesChecked(selection.actions, confirmedPrices);
  return (
    <details id="selected-option" className="transfer-details" ref={detailsRef}>
      <summary>
        Transfer details
        <ChevronRightIcon
          aria-hidden="true"
          className="transfer-details__chevron size-4"
        />
      </summary>
      <article
        className="selected-option"
        aria-label="Selected transfer option"
      >
        <StatusBadge tone={checked ? "success" : "warning"}>
          {checked ? "Prices checked" : "Provisional prices"}
        </StatusBadge>
        {previewError ? (
          <p role="alert">{previewError}</p>
        ) : (
          option && (
            <>
              {option.gain <= threshold && (
                <p className="muted selected-option__threshold">
                  <StatusBadge tone="neutral">
                    Below shortlist threshold
                  </StatusBadge>{" "}
                  This option does not clear the {expectedPoints(threshold)}{" "}
                  margin for making a transfer.
                </p>
              )}
              {preview && (
                <Disclosure summary="Gameweek-by-gameweek gains">
                  <WeeklyBreakdown
                    weeks={weeks}
                    baseline={baseline}
                    preview={preview}
                    hits={
                      selection.kind === "plan"
                        ? selection.plan.weeks.map((week) => week.hit)
                        : weeks.map((_, index) =>
                            index === 0 ? selection.move.hit : 0,
                          )
                    }
                    netGain={option.gain}
                  />
                </Disclosure>
              )}
              <Disclosure summary="Compare players · minutes and attacking threat">
                {selection.actions.map((action) => (
                  <PlayerComparison
                    key={`${action.week}-${action.outId}-${action.inId}`}
                    data={data}
                    outId={action.outId}
                    inId={action.inId}
                    weeks={weeks.filter((week) => week >= action.week)}
                  />
                ))}
              </Disclosure>
              <Disclosure summary="Why this option · risks and assumptions">
                <ul className="selected-option__list">
                  {option.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
                {selection.kind === "move" && (
                  <>
                    <ul className="selected-option__list">
                      {selection.move.risks.map((risk) => (
                        <li key={risk}>{risk}</li>
                      ))}
                    </ul>
                    {selection.move.gainPersistent !== undefined &&
                      selection.move.gainRecovery !== undefined &&
                      selection.move.gainRecovery !==
                        selection.move.gainPersistent && (
                        <p className="muted">
                          Availability scenarios:{" "}
                          {signedPoints(selection.move.gainPersistent)} if flags
                          persist; {signedPoints(selection.move.gainRecovery)}{" "}
                          if flagged players recover after next gameweek. These
                          are scenarios, not a confidence interval.
                        </p>
                      )}
                  </>
                )}
                {selection.kind === "plan" && (
                  <p className="muted">
                    Future prices are held at today’s values. The plan uses your
                    selected availability scenario and a bounded search of
                    alternatives.
                  </p>
                )}
              </Disclosure>
            </>
          )
        )}
        <Disclosure summary="Check selling prices" defaultOpen={!!previewError}>
          <div className="selling-check-grid">
            {outgoingIds.map((id) => {
              const player = findPlayer(data.bootstrap.elements, id);
              const owned = settings.squad.find((item) => item.id === id);
              return player && owned ? (
                <SellingPriceCheck
                  key={`${id}-${owned.sellingPrice}`}
                  player={player}
                  value={owned.sellingPrice}
                  confirmed={confirmedPrices.includes(id)}
                  onConfirm={(price) => onConfirmPrice(id, price)}
                />
              ) : null;
            })}
          </div>
        </Disclosure>
        {priceConfirmed && (
          <p role="status" className="price-notice">
            {priceConfirmedMessage}
          </p>
        )}
      </article>
    </details>
  );
}
