import { useEffect, useRef } from "react";
import { Button } from "@jack.winter/pancake-ui";
import "./workspace-heading.css";
import type { Settings } from "@/lib/schemas";
import type { Analysis } from "@/lib/model";
import { money } from "../format";
export function WorkspaceHeading({
  settings,
  result,
  loading = false,
  onEditTeam,
}: {
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
          {settings.teamName || `Team #${settings.entryId}`}
          {!editing && ` / ${result ? "THE NEXT MOVE" : "SQUAD CHECK"}`}
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
              variant="secondary"
              className="workspace-heading__edit"
              onClick={onEditTeam}
            >
              Edit team details <span aria-hidden="true">↗</span>
            </Button>
          )}
          <dl className="workspace-figures">
            <div>
              <dt>In the bank</dt>
              <dd>
                {Number.isFinite(settings.bank) ? money(settings.bank) : "—"}
              </dd>
            </div>
            <div>
              <dt>Free transfers</dt>
              <dd>{settings.freeTransfers}</dd>
            </div>
            {result?.weeks.length ? (
              <div>
                <dt>Planning horizon</dt>
                <dd className="workspace-horizon">
                  GW{result.weeks[0]}
                  {result.weeks.length > 1 ? `–${result.weeks.at(-1)}` : ""}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      )}
    </section>
  );
}
