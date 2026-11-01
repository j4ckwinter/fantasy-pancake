import { useEffect, type RefObject } from "react";
import { Disclosure, StatusChip } from "@jack.winter/pancake-ui";
import type { Lineup } from "@/lib/model";
import { WeeklyBreakdown } from "./weekly-breakdown";
import { PlayerComparison } from "./player-comparison";
import type { Data, Settings } from "@/lib/schemas";
import type { Selection } from "../selection";
import { signed } from "../format";
import { SellingPriceCheck } from "./selling-price-check";

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
  priceNotice,
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
  priceNotice: string;
  confirmedPrices: number[];
  onConfirmPrice: (id: number, price: number) => void;
}) {
  useEffect(() => {
    if (previewError && detailsRef.current) detailsRef.current.open = true;
  }, [previewError, detailsRef]);
  const option = selection.move ?? selection.plan;
  const outgoingIds = [
    ...new Set(selection.actions.map((action) => action.outId)),
  ];
  const pricesChecked = outgoingIds.every((id) => confirmedPrices.includes(id));
  return (
    <details id="selected-option" className="transfer-details" ref={detailsRef}>
      <summary>Transfer details</summary>
      <article
        className="selected-option"
        aria-label="Selected transfer option"
      >
        <StatusChip tone={pricesChecked ? "success" : "warning"}>
          {pricesChecked ? "Prices checked" : "Provisional prices"}
        </StatusChip>
        {previewError ? (
          <p role="alert">{previewError}</p>
        ) : (
          option && (
            <>
              {option.gain <= threshold && (
                <p className="muted">
                  <StatusChip tone="neutral">
                    Below shortlist threshold
                  </StatusChip>{" "}
                  This option does not clear the {threshold.toFixed(1)}{" "}
                  score-unit margin for making a transfer.
                </p>
              )}
              {preview && (
                <Disclosure summary="Gameweek-by-gameweek gains">
                  <WeeklyBreakdown
                    weeks={weeks}
                    baseline={baseline}
                    preview={preview}
                    hit={option.hit}
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
                <ul>
                  {option.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
                {selection.move && (
                  <>
                    <ul>
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
                          {signed(selection.move.gainPersistent)} if flags
                          persist; {signed(selection.move.gainRecovery)} if
                          flagged players recover after next gameweek. These are
                          scenarios, not a confidence interval.
                        </p>
                      )}
                  </>
                )}
                {selection.plan && (
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
              const player = data.bootstrap.elements.find(
                (item) => item.id === id,
              );
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
        {priceNotice && (
          <p role="status" className="price-notice">
            {priceNotice}
          </p>
        )}
      </article>
    </details>
  );
}
