import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import "./workspace-heading.css";
import type { Settings } from "@/lib/schemas";
import type { Analysis } from "@/lib/model";
import { gameweekRange, money, teamLabel } from "../format";
export function WorkspaceHeading({
  settings,
  result,
  loading = false,
  balancesFromImport,
  canEdit,
  refreshing,
  onEditTeam,
}: {
  refreshing: boolean;
  balancesFromImport: boolean;
  canEdit: boolean;
  loading?: boolean;
  onEditTeam: () => void;
  settings: Settings;
  result: Analysis | null;
}) {
  const workspaceHeading = useRef<HTMLHeadingElement>(null);
  const hasResult = !!result;
  const editing = !result && !loading;
  useEffect(() => {
    if (hasResult) {
      workspaceHeading.current?.focus({ preventScroll: true });
      workspaceHeading.current
        ?.closest("section")
        ?.scrollIntoView({ block: "start" });
    }
  }, [hasResult]);

  return (
    <section
      className={`workspace-heading${result ? " workspace-heading--results" : editing ? " workspace-heading--editing" : ""}`}
    >
      <div>
        <span className="eyebrow">
          {teamLabel(settings)}
          {!editing &&
            ` / ${refreshing ? "REFRESHING…" : result ? "THE NEXT MOVE" : "SQUAD CHECK"}`}
        </span>
        <h1 ref={workspaceHeading} tabIndex={-1}>
          {result
            ? "Your transfer shortlist"
            : loading
              ? "Finding your next move"
              : "Your team"}
        </h1>
        {!result && loading && (
          <p>Loading recent matches and comparing your options.</p>
        )}
      </div>
      {!editing && (
        <div className="workspace-heading__summary">
          {result && (
            <Button
              variant="outline"
              className="workspace-heading__edit"
              disabled={!canEdit}
              onClick={onEditTeam}
            >
              Edit team details <span aria-hidden="true">↗</span>
            </Button>
          )}
          <dl className="workspace-figures">
            <div>
              <dt>{balancesFromImport ? "Deadline bank" : "In the bank"}</dt>
              <dd>
                {Number.isFinite(settings.bank) ? money(settings.bank) : "—"}
              </dd>
            </div>
            <div>
              <dt>{balancesFromImport ? "Assumed FTs" : "Free transfers"}</dt>
              <dd>{settings.freeTransfers}</dd>
            </div>
            {result?.weeks.length ? (
              <div>
                <dt>Planning horizon</dt>
                <dd className="workspace-horizon">
                  {gameweekRange(result.weeks)}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      )}
    </section>
  );
}
