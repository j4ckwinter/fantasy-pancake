import { useEffect, useRef, useState } from "react";
import { ArrowLeftRightIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { marketPricePick } from "../settings";
import { money } from "../format";
import { PlayerPicker } from "./player-picker";
import { findClub, findPlayer } from "../players";
import type { Data, Settings } from "@/lib/schemas";
import "./squad-editor.css";

export function SquadEditor({
  data,
  settings,
  onChange,
}: {
  data: Data;
  settings: Settings;
  onChange: (settings: Settings) => void;
}) {
  const [focusRow, setFocusRow] = useState<number | null>(null);
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
            current: findPlayer(data.bootstrap.elements, pick.id),
          }))
          .filter(({ current }) => (current?.element_type ?? 0) === group.id);
        if (!picks.length) return null;
        return (
          <section className="position-group" key={group.id}>
            <header className="position-heading">
              <h3>{group.name}</h3>
              <span className="eyebrow">{picks.length} players</span>
            </header>
            <div className="position-players">
              {picks.map(({ index }) => (
                <SquadPlayerRow
                  key={index}
                  data={data}
                  settings={settings}
                  index={index}
                  focusTrigger={focusRow === index}
                  onClosed={() => setFocusRow(index)}
                  onFocused={() => setFocusRow(null)}
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
  focusTrigger,
  onClosed,
  onFocused,
  onChange,
}: {
  data: Data;
  settings: Settings;
  index: number;
  focusTrigger: boolean;
  onClosed: () => void;
  onFocused: () => void;
  onChange: (settings: Settings) => void;
}) {
  const [replacing, setReplacing] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const current = findPlayer(data.bootstrap.elements, settings.squad[index].id);
  const name =
    current?.web_name ?? `Unavailable player #${settings.squad[index].id}`;
  const club = findClub(data.bootstrap.teams, current?.team)?.short_name;
  const candidates = data.bootstrap.elements
    .filter(
      (player) =>
        (!current || player.element_type === current.element_type) &&
        player.can_select &&
        !settings.squad.some((pick) => pick.id === player.id),
    )
    .sort((a, b) => a.web_name.localeCompare(b.web_name));
  useEffect(() => {
    if (!focusTrigger) return;
    trigger.current?.focus();
    onFocused();
  }, [focusTrigger, onFocused]);
  function close() {
    setReplacing(false);
    onClosed();
  }
  return (
    <div
      className="squad-player-row"
      data-replacing={replacing || undefined}
      data-unavailable={!current || undefined}
      onKeyDown={(event) => {
        if (replacing && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <div className="squad-player-row__summary">
        <div className="squad-player-row__player">
          <strong>{name}</strong>
          {current && (
            <span>
              {club} · {money(current.now_cost)}
            </span>
          )}
        </div>
        <Button
          ref={trigger}
          type="button"
          variant="outline"
          aria-label={`Replace ${name}`}
          aria-expanded={replacing}
          onClick={() => (replacing ? close() : setReplacing(true))}
        >
          <ArrowLeftRightIcon aria-hidden="true" className="size-4" />
          Replace
        </Button>
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
          <Button
            type="button"
            variant="ghost"
            className="squad-player-row__cancel"
            onClick={close}
          >
            <XIcon aria-hidden="true" className="size-4" />
            Cancel replacement
          </Button>
        </div>
      )}
    </div>
  );
}
