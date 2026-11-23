import { ChevronDownIcon, LockIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Data, Settings } from "@/lib/schemas";
import { findPlayer } from "../players";
import "./player-locks.css";

export function PlayerLocks({
  data,
  settings,
  disabled,
  onToggle,
}: {
  data: Data;
  settings: Settings;
  disabled: boolean;
  onToggle: (id: number) => void;
}) {
  const lockedIds = settings.lockedPlayerIds ?? [];
  return (
    <details className="planner-tool">
      <summary>
        <span className="planner-tool__icon" aria-hidden="true">
          <LockIcon className="size-4" />
        </span>
        <span className="planner-tool__label">
          <span>{`Keep players · ${lockedIds.length} locked`}</span>
          <small>Protect your must-keep players from transfers.</small>
        </span>
        <ChevronDownIcon
          aria-hidden="true"
          className="planner-tool__chevron size-4"
        />
      </summary>
      <div className="custom-panel-content">
        <p className="muted">
          Keep selected players in your squad. Locks apply to singles,
          two-transfer plans, rolling and custom comparisons.
        </p>
        <div className="player-locks">
          {settings.squad.map(({ id }) => {
            const player = findPlayer(data.bootstrap.elements, id);
            if (!player) return null;
            const locked = lockedIds.includes(id);
            return (
              <Button
                key={id}
                type="button"
                variant="outline"
                aria-pressed={locked}
                disabled={disabled}
                aria-label={`${locked ? "Unlock" : "Keep"} ${player.web_name}`}
                onClick={() => onToggle(id)}
              >
                {locked ? (
                  <LockIcon aria-hidden="true" className="size-4" />
                ) : (
                  <PlusIcon aria-hidden="true" className="size-4" />
                )}
                {player.web_name}
              </Button>
            );
          })}
        </div>
      </div>
    </details>
  );
}
