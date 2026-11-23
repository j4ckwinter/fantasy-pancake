"use client";
import { Banner } from "@/components/banner";
import { overLimitClubs, validateSquad } from "@/lib/model";
import { usePlanner } from "./use-planner";
import { PlannerLoading } from "./components/planner-loading";
import { PlannerHeader } from "./components/planner-header";
import { WorkspaceHeading } from "./components/workspace-heading";
import { ImportTeam } from "./components/import-team";
import { PlannerPrinciples } from "./components/planner-information";
import { PlannerFooter } from "./components/planner-footer";
import { TeamReview } from "./components/team-review";
import { TransferResults } from "./components/transfer-results";
import { SavedPlanNotice } from "./components/saved-plan-notice";
import { noticeText } from "./messages";
export default function Planner() {
  const planner = usePlanner();
  const { data, settings, result, busy, error, notice } = planner;
  const errors = data && settings ? validateSquad(data, settings) : [];
  const showTeamReview = !!(
    data &&
    settings &&
    !result &&
    (!busy || planner.reviewOpen)
  );
  const onLanding = !settings && !busy;
  const excessClubs = data && settings ? overLimitClubs(data, settings) : [];
  return (
    <main
      className={
        settings
          ? `planner-workspace${result ? " planner-results" : ""}`
          : "planner-landing"
      }
    >
      <PlannerHeader data={data} />
      {settings && !showTeamReview ? (
        <WorkspaceHeading
          settings={settings}
          result={result}
          loading={!!busy && !planner.reviewOpen}
          balancesFromImport={notice === "import-caveat"}
          canEdit={planner.idle}
          refreshing={planner.refreshing}
          onEditTeam={planner.editTeam}
        />
      ) : onLanding ? (
        <ImportTeam
          ready={!!data}
          error={error}
          onRetry={planner.retry}
          teamId={planner.teamId}
          onTeamIdChange={planner.setTeamId}
          onImport={planner.importSquad}
        />
      ) : null}
      {error && !onLanding && (
        <div className="notice">
          <Banner tone="error" title="Something needs attention">
            {error}
          </Banner>
        </div>
      )}
      {excessClubs.length > 0 && (
        <div className="notice">
          <Banner title="Check this club-limit exception" tone="warning">
            You have more than three players from {excessClubs.join(", ")}. Keep
            this only if it matches your actual FPL squad after a real-world
            club transfer. Rolling is allowed, but any suggested transfer must
            restore every club to the limit. If that needs multiple moves, this
            planner may only find a correction if one or two transfers can
            restore the limits.
          </Banner>
        </div>
      )}
      {busy && (
        <PlannerLoading
          label={busy}
          title={
            settings
              ? "Weighing up your options"
              : data
                ? "Bringing your squad together"
                : "Setting up the tactics board"
          }
        />
      )}
      {data && !settings && notice && (
        <div className="notice">
          <Banner title="Saved settings" tone="warning">
            {noticeText[notice]}
          </Banner>
        </div>
      )}
      {onLanding && <PlannerPrinciples />}
      {data && settings && showTeamReview && (
        <TeamReview
          data={data}
          settings={settings}
          busy={!!busy}
          notice={notice}
          editingTeam={planner.editingTeam}
          errors={errors}
          canReturnToShortlist={planner.canReturnToShortlist}
          hasTeamEdits={planner.hasTeamEdits}
          onCancel={planner.cancelTeamEdit}
          onImportAnother={planner.importAnother}
          onCompare={planner.evaluate}
          onToggleEditing={planner.toggleEditing}
          onUpdate={planner.update}
          onUpdateSquad={planner.updateSquad}
        />
      )}
      {settings && result && planner.savedPlan && (
        <SavedPlanNotice
          gameweek={settings.sourceGameweek}
          busy={!planner.idle}
          onRefresh={planner.refreshSavedTeam}
        />
      )}
      {data && settings && result && (
        <TransferResults
          category={planner.planCategory}
          onCategoryChange={planner.changeCategory}
          data={data}
          settings={settings}
          result={result}
          notice={notice}
          priceConfirmed={planner.priceConfirmed}
          confirmedPrices={planner.confirmedPrices}
          lineupIndex={planner.lineupIndex}
          onLineupChange={planner.selectLineup}
          onConfirmPrice={planner.confirmSellingPrice}
          selection={planner.selection}
          preview={planner.preview}
          previewError={planner.previewError}
          previewCaptaincy={planner.previewCaptaincy}
          onSelectMove={planner.selectMove}
          onSelectPlan={planner.selectPlan}
          onClearSelection={planner.clearSelection}
          onToggleLock={planner.toggleLock}
          onCompare={planner.compareTransfer}
          customBusy={planner.customBusy}
          idle={planner.idle}
          customError={planner.customError}
          playerData={planner.playerData ?? data}
          playerId={planner.playerId}
          onPlayerSelect={planner.openPlayer}
          onClosePlayer={planner.closePlayer}
          chipPreviewKey={planner.chipPreviewKey}
          chipPreview={planner.chipPreview}
          onPreviewChip={planner.previewChip}
          onRefreshFromFpl={planner.refreshSavedTeam}
        />
      )}
      <PlannerFooter data={data} landing={!settings} />
    </main>
  );
}
