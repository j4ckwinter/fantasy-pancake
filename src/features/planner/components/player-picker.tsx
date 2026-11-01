import { useEffect, useId, useRef, useState } from "react";
import { TextField } from "@jack.winter/pancake-ui";
import type { Data, Player } from "@/lib/schemas";
import { money } from "../format";
import "./player-picker.css";

export function PlayerPicker({
  players,
  label = "Player to buy",
  autoFocus = false,
  teams,
  value,
  disabled,
  onChange,
}: {
  players: Player[];
  label?: string;
  autoFocus?: boolean;
  teams: Data["bootstrap"]["teams"];
  value: number | null;
  disabled: boolean;
  onChange: (id: number | null) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLDivElement>(null);
  const pointerActive = useRef(false);
  const activeOption = useRef<HTMLLIElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = players.find((player) => player.id === value);
  const club = (player: Player) =>
    teams.find((team) => team.id === player.team)?.short_name ?? "";
  const matches = players.filter((player) =>
    `${player.web_name} ${club(player)}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  const expanded = open && !disabled;
  const active = matches[Math.min(activeIndex, matches.length - 1)];
  const choose = (player: Player) => {
    onChange(player.id);
    setQuery("");
    setOpen(false);
    input.current?.focus();
  };
  useEffect(() => {
    if (expanded) activeOption.current?.scrollIntoView({ block: "nearest" });
  }, [expanded, active?.id]);

  useEffect(() => {
    if (!expanded) return;
    // The mobile popup occupies page space. Keep it in place through a pointer
    // click so blur cannot move the clicked control between press and release.
    const onPointerDown = () => {
      pointerActive.current = true;
    };
    const onKeyDown = () => {
      pointerActive.current = false;
    };
    const onClick = (event: MouseEvent) => {
      pointerActive.current = false;
      if (
        event.target instanceof Node &&
        !picker.current?.contains(event.target)
      )
        setOpen(false);
    };
    const onPointerCancel = () => {
      pointerActive.current = false;
      if (!picker.current?.contains(document.activeElement)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("pointercancel", onPointerCancel, true);
    return () => {
      pointerActive.current = false;
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("pointercancel", onPointerCancel, true);
    };
  }, [expanded]);

  return (
    <div ref={picker} className="player-picker">
      <TextField
        ref={input}
        id={id}
        label={label}
        autoFocus={autoFocus}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={`${id}-options`}
        aria-activedescendant={
          expanded && active ? `${id}-${active.id}` : undefined
        }
        autoComplete="off"
        placeholder="Search player or club"
        value={
          selected
            ? `${selected.web_name} · ${club(selected)} · ${money(selected.now_cost)}`
            : query
        }
        disabled={disabled}
        onFocus={(event) => {
          if (selected) event.currentTarget.select();
          setOpen(true);
        }}
        onClick={(event) => {
          if (selected) event.currentTarget.select();
          setOpen(true);
        }}
        onBlur={() => {
          if (!pointerActive.current) setOpen(false);
        }}
        onChange={(event) => {
          onChange(null);
          setQuery(event.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((index) =>
              !expanded
                ? 0
                : Math.max(
                    0,
                    Math.min(
                      matches.length - 1,
                      index + (event.key === "ArrowDown" ? 1 : -1),
                    ),
                  ),
            );
          } else if (event.key === "Enter" && expanded) {
            event.preventDefault();
            if (active) choose(active);
          } else if (event.key === "Escape" && expanded) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          }
        }}
      />
      {expanded && (
        <div className="player-picker__popup">
          <ul id={`${id}-options`} role="listbox" aria-label="Matching players">
            {matches.map((player) => (
              <li
                key={player.id}
                id={`${id}-${player.id}`}
                ref={active?.id === player.id ? activeOption : undefined}
                role="option"
                aria-selected={selected?.id === player.id}
                className={active?.id === player.id ? "is-active" : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(player)}
              >
                <strong>{player.web_name}</strong>
                <span>
                  {club(player)} · {money(player.now_cost)}
                </span>
              </li>
            ))}
          </ul>
          {!matches.length && (
            <p role="status">No matching players. Try another name or club.</p>
          )}
        </div>
      )}
    </div>
  );
}
