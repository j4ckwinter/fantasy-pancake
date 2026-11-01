import { useRef } from "react";
import { BannerToast, Button, EmptyState } from "@jack.winter/pancake-ui";
import type { Data, Settings } from "@/lib/schemas";
import type { Analysis, Lineup, Move, TransferPlan } from "@/lib/model";
import type { Selection } from "../selection";
import { TransferPlans } from "./transfer-plans";
import { GroupedTransfers } from "./grouped-transfers";
import { PlayerLocks } from "./player-locks";
import { CustomTransferForm } from "./custom-transfer-form";
import { SelectedOption } from "./selected-option";
import { LineupPreview } from "./lineup-preview";
import { PlayerDetails } from "./player-details";
import { RollOption } from "./roll-option";
import { MobilePlannerNav } from "./mobile-planner-nav";
import "./results-workspace.css";

export function TransferResults({
  data,
  category,
  onCategoryChange,
  playerData,
  settings,
  result,
  notice,
  priceNotice,
  confirmedPrices,
  lineupIndex,
  onLineupChange,
  onConfirmPrice,
  selection,
  preview,
  previewError,
  previewSquadIdsByWeek,
  onSelectMove,
  onSelectPlan,
  onClearSelection,
  onToggleLock,
  onCompare,
  customBusy,
  customError,
  playerId,
  onPlayerSelect,
  onClosePlayer,
}: {
  data: Data;
  category: "singles" | "pair-now" | "roll-then-transfer";
  onCategoryChange: (
    category: "singles" | "pair-now" | "roll-then-transfer",
  ) => void;
  playerData?: Data;
  settings: Settings;
  result: Analysis;
  notice: string;
  priceNotice: string;
  confirmedPrices: number[];
  lineupIndex: number;
  onLineupChange: (index: number) => void;
  onConfirmPrice: (id: number, price: number) => void;
  selection: Selection | null;
  preview: Lineup[] | null;
  previewError: string;
  previewSquadIdsByWeek: number[][];
  onSelectMove: (move: Move) => void;
  onSelectPlan: (plan: TransferPlan) => void;
  onClearSelection: () => void;
  onToggleLock: (id: number) => void;
  onCompare: (outId: number, inId: number) => void;
  customBusy: boolean;
  customError: string;
  playerId: number | null;
  onPlayerSelect: (id: number) => void;
  onClosePlayer: () => void;
}) {
  const transferDetails = useRef<HTMLDetailsElement>(null);
  const previewOrigin = useRef<{
    element: HTMLElement;
    scrollY: number;
  } | null>(null);
  function rememberOrigin(element: HTMLElement) {
    previewOrigin.current = { element, scrollY: window.scrollY };
  }
  function returnToOptions() {
    const origin = previewOrigin.current;
    if (origin?.element.isConnected && origin.element.getClientRects().length) {
      origin.element.focus({ preventScroll: true });
      window.scrollTo({ top: origin.scrollY, behavior: "instant" });
    } else {
      document
        .getElementById("planner-options")
        ?.scrollIntoView({ block: "start" });
    }
  }
  const customPanel = useRef<HTMLDetailsElement>(null);
  const plans = result.plans ?? [];
  const categoryPlans = plans.filter((plan) => plan.kind === category);
  const maxTransfers =
    1 + data.bootstrap.game_settings.max_extra_free_transfers;
  const incomingCount = new Set(result.moves.map((move) => move.inId)).size;
  return (
    <section
      className="results-workspace"
      onClickCapture={(event) => {
        const button = (event.target as HTMLElement).closest<HTMLElement>(
          ".preview-toggle",
        );
        if (button) rememberOrigin(button);
      }}
      onSubmitCapture={(event) => {
        const form = event.target as HTMLFormElement;
        if (form.matches(".custom-transfer-form")) {
          const submit = form.querySelector<HTMLElement>(
            'button[type="submit"]',
          );
          if (submit) rememberOrigin(submit);
        }
      }}
    >
      {notice.includes("could not be saved") && (
        <BannerToast title="Settings not saved" tone="warning">
          {notice}
        </BannerToast>
      )}
      <MobilePlannerNav
        onCompare={() => {
          if (customPanel.current) customPanel.current.open = true;
        }}
      />
      <div className="results-layout">
        <div className="results-grid">
          <section
            id="planner-options"
            className="workspace-section"
            aria-label="Transfer options"
          >
            <div className="options-heading">
              <h2>Transfer options</h2>
              <span>
                {category === "singles"
                  ? `${incomingCount} incoming ${incomingCount === 1 ? "option" : "options"}`
                  : `${categoryPlans.length} ${categoryPlans.length === 1 ? "plan" : "plans"}`}
              </span>
            </div>
            <div
              className="plan-categories"
              role="group"
              aria-label="Plan category"
            >
              {(
                [
                  { value: "singles", label: "Singles" },
                  { value: "pair-now", label: "Two transfers" },
                  { value: "roll-then-transfer", label: "Roll then move" },
                ] as const
              ).map((item) => (
                <Button
                  key={item.value}
                  variant="secondary"
                  aria-pressed={category === item.value}
                  onClick={() => {
                    if (category !== item.value) {
                      onClearSelection();
                      previewOrigin.current = null;
                      onCategoryChange(item.value);
                    }
                  }}
                >
                  {item.label}
                </Button>
              ))}
            </div>
            {!(result.moves.length || plans.length) &&
              result.weeks.length > 0 && (
                <RollOption
                  nextFreeTransfers={Math.min(
                    maxTransfers,
                    settings.freeTransfers + 1,
                  )}
                  recommended
                  reason={result.rollReason}
                  onPreview={onClearSelection}
                />
              )}
            {category === "singles" ? (
              <>
                {result.moves.length ? (
                  <GroupedTransfers
                    data={data}
                    settings={settings}
                    moves={result.moves}
                    weeks={result.weeks}
                    selectedKey={selection?.key ?? null}
                    confirmedPrices={confirmedPrices}
                    onSelect={onSelectMove}
                    onClearSelection={onClearSelection}
                    onPlayerSelect={onPlayerSelect}
                  />
                ) : (
                  <p className="muted">
                    No single transfer clears the {result.threshold.toFixed(1)}{" "}
                    score-unit threshold. You can still compare your own move
                    below.
                  </p>
                )}
              </>
            ) : (
              <TransferPlans
                weeks={result.weeks}
                data={data}
                plans={categoryPlans}
                confirmedPrices={confirmedPrices}
                selection={selection}
                onSelect={onSelectPlan}
                onClearSelection={onClearSelection}
                onPlayerSelect={onPlayerSelect}
              />
            )}
          </section>
          <section className="planner-tools" aria-label="Fine-tune your plan">
            <div className="planner-tools__heading">
              Fine-tune your plan <span>Optional tools</span>
            </div>
            <details
              ref={customPanel}
              id="planner-compare"
              className="planner-tool workspace-section"
              aria-label="Custom transfer comparison"
            >
              <summary>
                <span className="planner-tool__icon" aria-hidden="true">
                  ⇄
                </span>
                <span className="planner-tool__label">
                  Compare your own transfer
                  <small>Have someone in mind? Test the move.</small>
                </span>
                <span className="planner-tool__chevron" aria-hidden="true">
                  +
                </span>
              </summary>
              <div className="custom-panel-content">
                <CustomTransferForm
                  data={data}
                  settings={settings}
                  busy={customBusy}
                  error={customError}
                  onViewDetails={() => {
                    if (transferDetails.current) {
                      transferDetails.current.open = true;
                      transferDetails.current.scrollIntoView({
                        block: "start",
                      });
                      transferDetails.current
                        .querySelector("summary")
                        ?.focus({ preventScroll: true });
                    }
                  }}
                  onCompare={onCompare}
                  selection={selection}
                  previewError={previewError}
                  threshold={result.threshold}
                />
              </div>
            </details>
            <PlayerLocks
              data={data}
              settings={settings}
              onToggle={onToggleLock}
            />
          </section>
        </div>
        <section
          id="planner-squad"
          className="workspace-squad workspace-section"
          aria-label="Your squad and locks"
        >
          <LineupPreview
            transferDetails={
              selection && (
                <SelectedOption
                  key={selection.key}
                  detailsRef={transferDetails}
                  data={data}
                  settings={settings}
                  selection={selection}
                  weeks={result.weeks}
                  baseline={result.baseline}
                  preview={preview}
                  threshold={result.threshold}
                  previewError={previewError}
                  priceNotice={priceNotice}
                  confirmedPrices={confirmedPrices}
                  onConfirmPrice={onConfirmPrice}
                />
              )
            }
            key={
              selection
                ? `${selection.key}:${selection.actions.map(({ week, outId, inId }) => `${week}-${outId}-${inId}`).join("/")}`
                : "baseline"
            }
            data={data}
            settings={settings}
            result={result}
            preview={preview}
            selectedLabel={selection?.label ?? "Your current squad"}
            onBackToOptions={returnToOptions}
            option={selection?.move ?? selection?.plan ?? null}
            pricesChecked={
              !!selection &&
              selection.actions.every((action) =>
                confirmedPrices.includes(action.outId),
              )
            }
            canClear={!!selection || customBusy}
            onClearSelection={onClearSelection}
            lineupIndex={lineupIndex}
            onLineupChange={onLineupChange}
            onPlayerSelect={onPlayerSelect}
            previewSquadIdsByWeek={previewSquadIdsByWeek}
          />
        </section>
      </div>
      {!result.weeks.length && (
        <EmptyState
          title="The horizon is empty"
          description="FPL has not published a future gameweek to plan for. Return when the new schedule is available."
        />
      )}
      <PlayerDetails
        data={playerData ?? data}
        playerId={playerId}
        onClose={onClosePlayer}
      />
    </section>
  );
}
