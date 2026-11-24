import { ArrowRightIcon, PauseIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  freeTransferCap,
  nextWeekFreeTransfers,
  type PlanWeek,
} from "@/lib/model";
import type { Data } from "@/lib/schemas";
import { findPlayer } from "../players";
import { minus, money, signedPoints, tenthsAddingUp } from "../format";
import { PlayerLink } from "./player-link";
import "./plan-timeline.css";

function holdNote(week: PlanWeek, cap: number) {
  const next = nextWeekFreeTransfers(week.freeTransfersAfter, cap);
  return next > week.freeTransfersBefore
    ? `Hold · bank a free transfer (${next} FT next week)`
    : `Hold · already at the ${cap} FT cap`;
}

function moveNote(week: PlanWeek) {
  const hit = week.hit ? `${minus}${week.hit} pts hit` : "No hit";
  return `${week.freeTransfersBefore} FT → ${week.freeTransfersAfter} left · ${hit} · ${money(week.bank)} bank`;
}

export function PlanTimeline({
  data,
  weeks,
  total,
  label,
  onPlayerSelect,
  shownWeek,
  onShowWeek,
}: {
  data: Data;
  weeks: PlanWeek[];
  total: number;
  label: string;
  onPlayerSelect: (id: number) => void;
  shownWeek: number | null;
  onShowWeek: (index: number) => void;
}) {
  const cap = freeTransferCap(data.bootstrap.game_settings);
  const gains = tenthsAddingUp(
    weeks.map((week) => week.gain),
    total,
  );
  const name = (id: number) =>
    findPlayer(data.bootstrap.elements, id)?.web_name ?? String(id);
  return (
    <ol className="plan-timeline" aria-label={`${label} week by week`}>
      {weeks.map((week, index) => {
        const holding = !week.actions.length;
        return (
          <li
            key={week.week}
            className={`plan-timeline__week${holding ? " is-hold" : ""}`}
          >
            <Button
              variant="outline"
              size="sm"
              className="plan-timeline__chip"
              aria-pressed={shownWeek === index}
              aria-label={`Show GW${week.week} lineup with ${label.toLowerCase()}`}
              onClick={() => onShowWeek(index)}
            >
              GW{week.week}
            </Button>
            <div className="plan-timeline__body">
              {holding ? (
                <p className="plan-timeline__hold">
                  <PauseIcon aria-hidden="true" className="size-4" />
                  {holdNote(week, cap)}
                </p>
              ) : (
                <ul className="plan-timeline__moves">
                  {week.actions.map((action) => (
                    <li key={`${action.outId}-${action.inId}`}>
                      <span className="sr-only">Sell </span>
                      <PlayerLink
                        className="player-detail-link plan-timeline__out"
                        playerId={action.outId}
                        onSelect={onPlayerSelect}
                      >
                        {name(action.outId)}
                      </PlayerLink>
                      <ArrowRightIcon
                        aria-hidden="true"
                        className="plan-timeline__arrow size-4"
                      />
                      <span className="sr-only">, buy </span>
                      <PlayerLink
                        className="player-detail-link plan-timeline__in"
                        playerId={action.inId}
                        onSelect={onPlayerSelect}
                      >
                        {name(action.inId)}
                      </PlayerLink>
                    </li>
                  ))}
                </ul>
              )}
              {!holding && (
                <p className="plan-timeline__meta">{moveNote(week)}</p>
              )}
            </div>
            <p className="plan-timeline__gain">
              <strong>{signedPoints(gains[index])}</strong>
              <span>vs holding, after hits</span>
            </p>
          </li>
        );
      })}
    </ol>
  );
}
