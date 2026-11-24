import { CheckIcon, ShieldAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/disclosure";
import { FORECAST_ACCURACY, type TransferPlan } from "@/lib/model";
import type { Data } from "@/lib/schemas";
import {
  planKey,
  planLabel,
  pricesChecked,
  type Selection,
} from "../selection";
import { findPlayer } from "../players";
import {
  expectedGainLabel,
  expectedPoints,
  gameweekRange,
  minus,
  money,
  planOptimismNote,
  signedPoints,
} from "../format";
import { PlanTimeline } from "./plan-timeline";
import "./transfer-group.css";
import "./plan-ahead.css";

type PlanActions = {
  data: Data;
  weeks: number[];
  confirmedPrices: number[];
  selection: Selection | null;
  onSelect: (plan: TransferPlan) => void;
  onClearSelection: () => void;
  onPlayerSelect: (id: number) => void;
  onShowWeek: (index: number) => void;
  shownWeek: number;
};

function transfersLabel(count: number) {
  return `${count} transfer${count === 1 ? "" : "s"}`;
}

function planSummary(plan: TransferPlan, checked: boolean) {
  return [
    transfersLabel(plan.actions.length),
    plan.hit ? `${minus}${plan.hit} pts hits` : "No hits",
    `${money(plan.remainingBank)} left`,
    ...(checked ? ["Prices checked"] : []),
  ].join(" · ");
}

function PreviewToggle({
  plan,
  selected,
  onSelect,
  onClearSelection,
}: {
  plan: TransferPlan;
  selected: boolean;
  onSelect: (plan: TransferPlan) => void;
  onClearSelection: () => void;
}) {
  const visibleLabel = selected ? "Selected" : "Preview plan";
  return (
    <Button
      variant="outline"
      className="preview-toggle"
      aria-pressed={selected}
      aria-label={`${visibleLabel}: ${planLabel(plan)}`}
      onClick={() => (selected ? onClearSelection() : onSelect(plan))}
    >
      {selected && <CheckIcon aria-hidden="true" className="size-4" />}
      {visibleLabel}
    </Button>
  );
}

function RecommendedPlan({
  plan,
  ...actions
}: PlanActions & { plan: TransferPlan }) {
  const { data, weeks, selection, confirmedPrices } = actions;
  const selected =
    selection?.kind === "plan" && selection.key === planKey(plan);
  return (
    <article
      className={`card plan-ahead__best${selected ? " is-selected" : ""}`}
      aria-label="Recommended plan"
    >
      <header className="plan-ahead__header">
        <div>
          <span className="plan-ahead__eyebrow">
            Plan ahead · {gameweekRange(weeks)}
          </span>
          <h3>{planLabel(plan)}</h3>
          <p className="transfer-group-subtitle">
            {planSummary(plan, pricesChecked(plan.actions, confirmedPrices))}
          </p>
        </div>
        <div className="alternative-gain plan-ahead__gain">
          <strong>{signedPoints(plan.gain)}</strong>
          <span>{expectedGainLabel(weeks)}</span>
        </div>
      </header>
      <PlanTimeline
        data={data}
        weeks={plan.weeks}
        total={plan.gain}
        label={planLabel(plan)}
        onPlayerSelect={actions.onPlayerSelect}
        shownWeek={selected ? actions.shownWeek : null}
        onShowWeek={(index) => {
          if (!selected) actions.onSelect(plan);
          actions.onShowWeek(index);
        }}
      />
      <div className="plan-ahead__footer">
        <p className="plan-ahead__caution">
          <ShieldAlertIcon aria-hidden="true" className="size-4" />
          <span>{planOptimismNote(FORECAST_ACCURACY)}</span>
        </p>
        <PreviewToggle
          plan={plan}
          selected={selected}
          onSelect={actions.onSelect}
          onClearSelection={actions.onClearSelection}
        />
      </div>
      <Disclosure summary="How this plan was found · limits">
        <ul className="plan-ahead__reasons">
          {plan.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </Disclosure>
    </article>
  );
}

function AlternativePlan({
  plan,
  ...actions
}: PlanActions & { plan: TransferPlan }) {
  const { data, selection, confirmedPrices } = actions;
  const selected =
    selection?.kind === "plan" && selection.key === planKey(plan);
  const name = (id: number) =>
    findPlayer(data.bootstrap.elements, id)?.web_name ?? String(id);
  return (
    <article
      className={`card plan-alternative${selected ? " is-selected" : ""}`}
      aria-label={`Alternative plan: ${planLabel(plan)}`}
    >
      <div className="plan-alternative__heading">
        <h4>{planLabel(plan)}</h4>
        <strong className="plan-alternative__gain">
          {signedPoints(plan.gain)}
        </strong>
      </div>
      <ul className="plan-alternative__moves">
        {plan.actions.map((action) => (
          <li key={`${action.week}-${action.outId}-${action.inId}`}>
            <span className="plan-alternative__week">GW{action.week}</span>
            <span>
              {name(action.outId)} → {name(action.inId)}
            </span>
          </li>
        ))}
      </ul>
      <div className="plan-alternative__footer">
        <span className="plan-alternative__summary">
          {planSummary(plan, pricesChecked(plan.actions, confirmedPrices))}
        </span>
        <PreviewToggle
          plan={plan}
          selected={selected}
          onSelect={actions.onSelect}
          onClearSelection={actions.onClearSelection}
        />
      </div>
    </article>
  );
}

export function PlanAhead({
  plans,
  threshold,
  ...actions
}: PlanActions & { plans: TransferPlan[]; threshold: number }) {
  const [best, ...alternatives] = plans;
  if (!best)
    return (
      <p className="options-empty">
        No plan over {gameweekRange(actions.weeks)} clears{" "}
        {expectedPoints(threshold)} per transfer after hits. Holding keeps your
        free transfers for later.
      </p>
    );
  return (
    <div className="plan-ahead">
      <RecommendedPlan plan={best} {...actions} />
      {alternatives.length > 0 && (
        <section className="plan-ahead__alternatives" aria-label="Alternatives">
          <h3 className="plan-ahead__subheading">Alternatives</h3>
          <div className="plan-alternative-grid">
            {alternatives.map((plan) => (
              <AlternativePlan key={planKey(plan)} plan={plan} {...actions} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
