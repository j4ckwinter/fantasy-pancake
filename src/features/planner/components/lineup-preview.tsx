"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronRightIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { mobileLayoutQuery } from "@/app/breakpoints";
import type { Captaincy, Lineup } from "@/lib/model";
import type { Data } from "@/lib/schemas";
import { PreviewMetrics } from "./preview-metrics";
import { PitchBoard } from "./pitch-board";
import { CaptainPick } from "./captain-pick";
import { PlayerLink } from "./player-link";
import { findPlayer } from "../players";
import "./lineup-preview.css";

export function LineupPreview({
  transferDetails,
  data,
  weeks,
  baseline: baselines,
  preview,
  selectedLabel,
  onBackToOptions,
  option,
  pricesChecked,
  canClear,
  onClearSelection,
  lineupIndex,
  onLineupChange,
  onPlayerSelect,
  captaincy,
  previewCaptaincy,
}: {
  transferDetails: ReactNode;
  data: Data;
  weeks: number[];
  baseline: Lineup[];
  preview: Lineup[] | null;
  selectedLabel: string;
  onBackToOptions: () => void;
  option: { gain: number; hit: number; remainingBank: number } | null;
  pricesChecked: boolean;
  canClear: boolean;
  onClearSelection: () => void;
  lineupIndex: number;
  onLineupChange: (index: number) => void;
  onPlayerSelect: (id: number) => void;
  captaincy: Captaincy[];
  previewCaptaincy: Captaincy[] | null;
}) {
  const [mode, setMode] = useState<"before" | "after">("after");
  const previewPanel = useRef<HTMLElement>(null);
  const hasPreview = !!preview;
  useEffect(() => {
    if (hasPreview && window.matchMedia(mobileLayoutQuery).matches) {
      previewPanel.current?.focus({ preventScroll: true });
      previewPanel.current?.scrollIntoView({
        block: "start",
        behavior: "instant",
      });
    }
  }, [hasPreview]);
  const baseline = baselines[lineupIndex];
  const changed = preview?.[lineupIndex];
  const after = mode === "after" && !!changed;
  const lineup = after ? changed : baseline;
  if (!lineup || !baseline) return null;
  const name = (id: number) =>
    findPlayer(data.bootstrap.elements, id)?.web_name ?? "None";
  const entered = changed?.ids.filter((id) => !baseline.ids.includes(id)) ?? [];
  const exited = baseline.ids.filter(
    (id) => changed && !changed.ids.includes(id),
  );
  const picks = after
    ? previewCaptaincy?.[lineupIndex]
    : captaincy[lineupIndex];
  return (
    <aside
      ref={previewPanel}
      id="lineup-comparison"
      tabIndex={-1}
      className="analysis-sidebar lineup-preview"
      aria-label="Lineup comparison"
    >
      {canClear && (
        <div className="lineup-preview__actions">
          {preview && (
            <a
              className="lineup-preview__back"
              href="#planner-options"
              onClick={(event) => {
                event.preventDefault();
                onBackToOptions();
              }}
            >
              <ArrowLeftIcon aria-hidden="true" className="size-4" />
              Back to options
            </a>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="lineup-preview__clear"
            onClick={onClearSelection}
          >
            <XIcon aria-hidden="true" className="size-4" />
            Clear preview
          </Button>
        </div>
      )}
      <div
        className="lineup-switcher"
        role="group"
        aria-label="Lineup gameweek"
      >
        {weeks.map((week, index) => (
          <Toggle
            key={week}
            className="lineup-switcher__option"
            aria-label={`Show lineup GW${week}`}
            pressed={lineupIndex === index}
            onClick={() => onLineupChange(index)}
          >
            GW{week}
          </Toggle>
        ))}
      </div>
      {changed && (
        <div
          className="lineup-switcher lineup-preview__mode"
          role="group"
          aria-label="Before or after transfers"
        >
          <Toggle
            className="lineup-switcher__option"
            pressed={!after}
            onClick={() => setMode("before")}
          >
            Before
          </Toggle>
          <Toggle
            className="lineup-switcher__option"
            pressed={after}
            onClick={() => setMode("after")}
          >
            After
          </Toggle>
        </div>
      )}
      <PitchBoard
        data={data}
        lineup={lineup}
        week={weeks[lineupIndex]}
        variant={after ? "after" : "before"}
        highlightIds={after ? entered : []}
        onPlayerSelect={onPlayerSelect}
      />
      {picks && (
        <CaptainPick
          data={data}
          captaincy={picks}
          onPlayerSelect={onPlayerSelect}
        />
      )}
      {preview && (
        <div className="lineup-preview__selection">
          <h3 aria-live="polite">{selectedLabel}</h3>
          <p>Preview only. Your FPL team is unchanged.</p>
        </div>
      )}
      {preview && option && (
        <div className="lineup-preview__summary">
          <PreviewMetrics
            {...option}
            weeks={weeks}
            pricesChecked={pricesChecked}
          />
        </div>
      )}
      {transferDetails}
      <details className="lineup-preview__details">
        <summary>
          <span>Bench and XI changes</span>
          <ChevronRightIcon
            aria-hidden="true"
            className="lineup-preview__chevron size-4"
          />
        </summary>
        <div className="lineup-preview__changes">
          {changed && (
            <>
              <p>
                <strong>Into XI</strong>{" "}
                {entered.length
                  ? entered.map(name).join(", ")
                  : "Starting XI unchanged"}
              </p>
              {exited.length > 0 && (
                <p>
                  <strong>Out of XI</strong> {exited.map(name).join(", ")}
                </p>
              )}
              <p>
                <strong>Captain</strong>{" "}
                {baseline.captain === changed.captain ? (
                  `${name(changed.captain)} stays captain`
                ) : (
                  <span className="lineup-preview__captain-change">
                    {name(baseline.captain)}
                    <ArrowRightIcon aria-hidden="true" className="size-4" />
                    <span className="sr-only">to</span>
                    {name(changed.captain)}
                  </span>
                )}
              </p>
            </>
          )}
          {picks && (
            <div className="lineup-preview__bench">
              <strong id="bench-order-title">Bench order</strong>
              <div className="lineup-preview__bench-slots">
                {picks.benchGoalkeeper !== null && (
                  <PlayerLink
                    playerId={picks.benchGoalkeeper}
                    onSelect={onPlayerSelect}
                    label={`View ${name(picks.benchGoalkeeper)} details`}
                  >
                    <span
                      className="lineup-preview__bench-slot"
                      aria-hidden="true"
                    >
                      GK
                    </span>
                    {name(picks.benchGoalkeeper)}
                  </PlayerLink>
                )}
                <ol aria-labelledby="bench-order-title">
                  {picks.bench.map((slot, index) => (
                    <li key={slot.playerId}>
                      <PlayerLink
                        playerId={slot.playerId}
                        onSelect={onPlayerSelect}
                        label={`View ${name(slot.playerId)} details`}
                      >
                        <span
                          className="lineup-preview__bench-slot"
                          aria-hidden="true"
                        >
                          {index + 1}
                        </span>
                        {name(slot.playerId)}
                      </PlayerLink>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
          <p className="muted">
            Tap a player for their form and forecast. The XI, captain and bench
            order are optimised each week; substitutes are ordered by their
            chance to come on times their forecast. These are previews, not
            saved transfers.
          </p>
        </div>
      </details>
    </aside>
  );
}
