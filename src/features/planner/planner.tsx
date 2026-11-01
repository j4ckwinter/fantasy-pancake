"use client";
import { BannerToast, Button } from "@jack.winter/pancake-ui";
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
          onEditTeam={planner.editTeam}
        />
      ) : !settings && !busy ? (
        <ImportTeam
          ready={!!data}
          teamId={planner.teamId}
          busy={!!busy}
          onTeamIdChange={planner.setTeamId}
          onImport={planner.importSquad}
        />
      ) : null}
      {error && (
        <div className="notice">
          <BannerToast tone="error" title="Something needs attention">
            {error}
          </BannerToast>
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
      {!data && !busy && (
        <Button onClick={planner.retry}>Retry loading data</Button>
      )}
      {data && !settings && notice && (
        <div className="notice">
          <BannerToast title="Saved settings" tone="warning">
            {notice}
          </BannerToast>
        </div>
      )}
      {!settings && !busy && <PlannerPrinciples />}
      {excessClubs.length > 0 && (
        <div className="notice">
          <BannerToast title="Check this club-limit exception" tone="warning">
            You have more than three players from {excessClubs.join(", ")}. Keep
            this only if it matches your actual FPL squad after a real-world
            club transfer. Rolling is allowed, but any suggested transfer must
            restore every club to the limit. If that needs multiple moves, this
            planner may only find a correction if one or two transfers can
            restore the limits.
          </BannerToast>
        </div>
      )}
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
          busy={!!busy}
          onRefresh={planner.refreshSavedTeam}
        />
      )}
      {data && settings && result && (
        <TransferResults
          category={planner.planCategory}
          onCategoryChange={planner.setPlanCategory}
          data={data}
          settings={settings}
          result={result}
          notice={notice}
          priceNotice={planner.priceNotice}
          confirmedPrices={planner.confirmedPrices}
          lineupIndex={planner.lineupIndex}
          onLineupChange={planner.selectLineup}
          onConfirmPrice={planner.confirmSellingPrice}
          selection={planner.selection}
          preview={planner.preview}
          previewError={planner.previewError}
          previewSquadIdsByWeek={planner.previewSquadIdsByWeek}
          onSelectMove={planner.selectMove}
          onSelectPlan={planner.selectPlan}
          onClearSelection={planner.clearSelection}
          onToggleLock={planner.toggleLock}
          onCompare={planner.compareTransfer}
          customBusy={planner.customBusy}
          customError={planner.customError}
          playerData={planner.playerData ?? data}
          playerId={planner.playerId}
          onPlayerSelect={planner.openPlayer}
          onClosePlayer={planner.closePlayer}
        />
      )}
      <PlannerFooter data={data} landing={!settings} />
    </main>
  );
}
