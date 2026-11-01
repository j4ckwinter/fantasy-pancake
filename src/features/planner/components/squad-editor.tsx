import { useRef, useState } from "react";
import { Button } from "@jack.winter/pancake-ui";
import { marketPricePick } from "../settings";
import { money } from "../format";
import { PlayerPicker } from "./player-picker";
import type { Data, Settings } from "@/lib/schemas";

export function SquadEditor({
  data,
  settings,
  onChange,
  editing = false,
}: {
  data: Data;
  settings: Settings;
  onChange: (settings: Settings) => void;
  editing?: boolean;
}) {
  const groups = [
    ...data.bootstrap.element_types.map((position) => ({
      id: position.id,
      name: (
        {
          1: "Goalkeepers",
          2: "Defenders",
          3: "Midfielders",
          4: "Forwards",
        } as Record<number, string>
      )[position.id],
    })),
    { id: 0, name: "Players to replace" },
  ];
  return (
    <div className="squad-editor">
      {groups.map((group) => {
        const picks = settings.squad
          .map((pick, index) => ({
            pick,
            index,
            current: data.bootstrap.elements.find(
              (player) => player.id === pick.id,
            ),
          }))
          .filter(({ current }) => (current?.element_type ?? 0) === group.id);
        if (!picks.length) return null;
        return (
          <section className="position-group" key={group.id}>
            <header className="position-heading">
              <h3>{group.name}</h3>
              <span>{picks.length} PLAYERS</span>
            </header>
            <div className="position-players">
              {picks.map(({ index }) => (
                <SquadPlayerRow
                  key={index}
                  data={data}
                  settings={settings}
                  index={index}
                  editing={editing}
                  onChange={onChange}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function SquadPlayerRow({
  data,
  settings,
  index,
  editing,
  onChange,
}: {
  data: Data;
  settings: Settings;
  index: number;
  editing: boolean;
  onChange: (settings: Settings) => void;
}) {
  const [replacing, setReplacing] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const current = data.bootstrap.elements.find(
    (player) => player.id === settings.squad[index].id,
  );
  const name =
    current?.web_name ?? `Unavailable player #${settings.squad[index].id}`;
  const club = data.bootstrap.teams.find(
    (team) => team.id === current?.team,
  )?.short_name;
  const candidates = data.bootstrap.elements
    .filter(
      (player) =>
        (!current || player.element_type === current.element_type) &&
        player.can_select &&
        !settings.squad.some((pick) => pick.id === player.id),
    )
    .sort((a, b) => a.web_name.localeCompare(b.web_name));
  function close() {
    setReplacing(false);
    requestAnimationFrame(() => trigger.current?.focus());
  }
  return (
    <div
      className="squad-player-row"
      onKeyDownCapture={(event) => {
        if (replacing && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <div className="squad-player-row__summary">
        <div>
          <strong>{name}</strong>
          {current && (
            <span>
              {club} · {money(current.now_cost)}
            </span>
          )}
        </div>
        {editing && (
          <Button
            ref={trigger}
            type="button"
            variant="secondary"
            aria-label={`Replace ${name}`}
            aria-expanded={replacing}
            onClick={() => (replacing ? close() : setReplacing(true))}
          >
            Replace
          </Button>
        )}
      </div>
      {replacing && (
        <div className="squad-player-row__search">
          <PlayerPicker
            players={candidates}
            teams={data.bootstrap.teams}
            value={null}
            disabled={false}
            label={`Replacement for ${name}`}
            autoFocus
            onChange={(id) => {
              if (id === null) return;
              onChange({
                ...settings,
                squad: settings.squad.map((pick, i) =>
                  i === index ? marketPricePick(data, id) : pick,
                ),
              });
              close();
            }}
          />
          <Button type="button" variant="secondary" onClick={close}>
            Cancel replacement
          </Button>
        </div>
      )}
    </div>
  );
}
