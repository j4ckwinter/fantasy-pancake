"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { mobileLayoutQuery } from "@/app/breakpoints";
import type { Lineup } from "@/lib/model";
import type { Data } from "@/lib/schemas";
import { PreviewMetrics } from "./preview-metrics";
import { PitchBoard } from "./pitch-board";
import { PlayerLink } from "./player-link";
import { findPlayer } from "../players";
import "./lineup-preview.css";

export function LineupPreview({
  transferDetails,
  data,
  squadIds,
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
  previewSquadIdsByWeek,
}: {
  transferDetails: ReactNode;
  data: Data;
  squadIds: number[];
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
  previewSquadIdsByWeek: number[][];
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
  const shownSquad = after ? previewSquadIdsByWeek[lineupIndex] : squadIds;
  const bench = shownSquad?.filter((id) => !lineup.ids.includes(id));
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
              ← Back to options
            </a>
          )}
          <button type="button" onClick={onClearSelection}>
            Clear preview
          </button>
        </div>
      )}
      <div
        className="lineup-switcher"
        role="group"
        aria-label="Lineup gameweek"
      >
        {weeks.map((week, index) => (
          <button
            type="button"
            key={week}
            aria-label={`Show lineup GW${week}`}
            aria-pressed={lineupIndex === index}
            onClick={() => onLineupChange(index)}
          >
            GW{week}
          </button>
        ))}
      </div>
      {changed && (
        <div
          className="lineup-switcher lineup-preview__mode"
          role="group"
          aria-label="Before or after transfers"
        >
          <button
            type="button"
            aria-pressed={!after}
            onClick={() => setMode("before")}
          >
            Before
          </button>
          <button
            type="button"
            aria-pressed={after}
            onClick={() => setMode("after")}
          >
            After
          </button>
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
          <span className="lineup-preview__chevron" aria-hidden="true">
            +
          </span>
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
                {baseline.captain === changed.captain
                  ? `${name(changed.captain)} stays captain`
                  : `${name(baseline.captain)} → ${name(changed.captain)}`}
              </p>
            </>
          )}
          {bench && (
            <div className="lineup-preview__bench">
              <strong>Bench · unordered</strong>
              <div>
                {bench.map((id) => (
                  <PlayerLink key={id} playerId={id} onSelect={onPlayerSelect}>
                    {name(id)}
                  </PlayerLink>
                ))}
              </div>
            </div>
          )}
          <p className="muted">
            Tap a player for their form and forecast. The XI and captain are
            optimised each week; these are previews, not saved transfers.
          </p>
        </div>
      </details>
    </aside>
  );
}
