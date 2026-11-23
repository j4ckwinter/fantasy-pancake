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
          ◇
        </span>
        <span className="planner-tool__label">
          <span>{`Keep players · ${lockedIds.length} locked`}</span>
          <small>Protect your must-keep players from transfers.</small>
        </span>
        <span className="planner-tool__chevron" aria-hidden="true">
          +
        </span>
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
                <span aria-hidden="true">{locked ? "●" : "+"}</span>{" "}
                {player.web_name}
              </Button>
            );
          })}
        </div>
      </div>
    </details>
  );
}
