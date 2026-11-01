import { Button } from "@jack.winter/pancake-ui";
import type { Data, Settings } from "@/lib/schemas";
import "./exploration.css";

export function PlayerLocks({
  data,
  settings,
  onToggle,
}: {
  data: Data;
  settings: Settings;
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
            const player = data.bootstrap.elements.find((p) => p.id === id);
            if (!player) return null;
            const locked = lockedIds.includes(id);
            return (
              <Button
                key={id}
                type="button"
                variant="secondary"
                aria-pressed={locked}
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
