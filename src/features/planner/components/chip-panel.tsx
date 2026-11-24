import {
  ArmchairIcon,
  CrownIcon,
  EyeIcon,
  InfoIcon,
  RefreshCwIcon,
  ShuffleIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import type { ChipAdvice } from "@/lib/model";
import type { ChipName } from "@/lib/schemas";
import {
  chipHorizonNote,
  chipOptimismNote,
  chipSummaries,
  chipsStatusText,
  chipsRefreshWarning,
  chipsUnknownText,
} from "../chips";
import { gameweekRange } from "../format";
import type { ChipsStatus } from "../session";
import "./chip-panel.css";

const chipIcons: Record<ChipName, LucideIcon> = {
  wildcard: ShuffleIcon,
  freehit: ZapIcon,
  bboost: ArmchairIcon,
  "3xc": CrownIcon,
};

export function ChipPanel({
  advice,
  weeks,
  previewKey,
  chipsStatus,
  savedPlan,
  busy,
  onPreview,
  onRefresh,
}: {
  advice: ChipAdvice;
  weeks: number[];
  previewKey: string | null;
  chipsStatus: ChipsStatus;
  savedPlan: boolean;
  busy: boolean;
  onPreview: (key: string, week: number) => void;
  onRefresh: () => void;
}) {
  if (!weeks.length) return null;
  return (
    <section
      id="planner-chips"
      className="chip-panel workspace-section"
      aria-labelledby="chip-panel-title"
    >
      <div className="chip-panel__heading">
        <h2 id="chip-panel-title">Chips</h2>
        <span>{gameweekRange(weeks)}</span>
      </div>
      {advice.status === "unknown" ? (
        <div className="chip-panel__unknown">
          <p>{chipsUnknownText(advice.missing, savedPlan)}</p>
          {advice.missing === "played-chips" && (
            <>
              <Button variant="outline" disabled={busy} onClick={onRefresh}>
                <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
                Refresh from FPL
              </Button>
              <p className="chip-panel__warning">{chipsRefreshWarning}</p>
            </>
          )}
        </div>
      ) : (
        <>
          {chipsStatus !== "current" && (
            <p className="chip-panel__stale" role="status">
              {chipsStatusText[chipsStatus]}
            </p>
          )}
          <ul className="chip-panel__list">
            {chipSummaries(advice).map((summary) => {
              const Icon = chipIcons[summary.chip];
              const active = previewKey === summary.key;
              return (
                <li
                  key={summary.key}
                  className={`chip-row${active ? " chip-row--active" : ""}`}
                  data-testid={`chip-${summary.key}`}
                >
                  <span className="chip-row__icon" aria-hidden="true">
                    <Icon className="size-4" />
                  </span>
                  <div className="chip-row__copy">
                    <h3>{summary.label}</h3>
                    <p>{summary.detail}</p>
                  </div>
                  <div className="chip-row__actions">
                    <StatusBadge tone={summary.tone}>
                      {summary.badge}
                    </StatusBadge>
                    {summary.previewWeek !== null && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="preview-toggle"
                        aria-pressed={active}
                        aria-label={`Preview ${summary.label} in GW${summary.previewWeek}`}
                        onClick={() =>
                          onPreview(summary.key, summary.previewWeek!)
                        }
                      >
                        <EyeIcon data-icon="inline-start" aria-hidden="true" />
                        Preview GW{summary.previewWeek}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <p className="chip-panel__note">
        <InfoIcon aria-hidden="true" className="size-4" />
        <span>
          {chipHorizonNote(weeks)} {chipOptimismNote()}
        </span>
      </p>
    </section>
  );
}
