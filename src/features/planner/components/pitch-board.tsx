import type { ReactNode } from "react";
import type { Data } from "@/lib/schemas";
import { findClub, findPlayer } from "../players";
import { PlayerLink } from "./player-link";
import "./pitch-board.css";

function Shirt({ goalkeeper = false }: { goalkeeper?: boolean }) {
  return (
    <svg
      className={`pitch-board__shirt${goalkeeper ? " pitch-board__shirt--keeper" : ""}`}
      viewBox="0 0 48 44"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M16 3 5 9 1 22l10 5 4-7v21h18V20l4 7 10-5-4-13-11-6-8 5-8-5Z"
        fill="currentColor"
        stroke="#101914"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="m17 4 7 5 7-5M15 19l18 12v8L15 27Z" fill="#101914" />
      <path d="m7 10 7 4M34 14l7-4M17 38h14" stroke="#101914" strokeWidth="2" />
      <path d="M27 15h4v4h-4z" fill="#101914" />
    </svg>
  );
}

const positionRows = ["GK", "DEF", "MID", "FWD"];
const illustratedShirts = [1, 4, 4, 2];

function PitchFrame({
  actual,
  label,
  eyebrow,
  title,
  formation,
  rows,
  caption,
}: {
  actual: boolean;
  label: string;
  eyebrow: string;
  title: string;
  formation: string;
  rows: ReactNode[];
  caption: string;
}) {
  return (
    <aside
      className={`pitch-board${actual ? " pitch-board--actual" : " pitch-board--illustration"}`}
      aria-label={label}
    >
      <div className="pitch-board__header">
        <div>
          <span className="pitch-board__eyebrow">
            <span className="pitch-board__signal" />
            {eyebrow}
          </span>
          <h2>{title}</h2>
        </div>
        <span className="pitch-board__formation">
          <small>SHAPE</small>
          {formation}
        </span>
      </div>
      <div className="pitch-board__field">
        <svg
          className="pitch-board__markings"
          viewBox="0 0 400 360"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <g fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="15" y="10" width="370" height="340" rx="2" />
            <path d="M15 180h370M120 10v54h160V10M157 10v24h86V10M120 350v-54h160v54M157 350v-24h86v24" />
            <circle cx="200" cy="180" r="42" />
            <circle cx="200" cy="180" r="2" fill="currentColor" />
            <path d="M165 64a42 42 0 0 0 70 0M165 296a42 42 0 0 1 70 0" />
          </g>
        </svg>
        <div className="pitch-board__players">
          {rows.map((row, index) => (
            <div
              className="pitch-board__row"
              data-position={positionRows[index]}
              key={index}
            >
              {row}
            </div>
          ))}
        </div>
      </div>
      <div className="pitch-board__footer">
        <p className="pitch-board__caption">{caption}</p>
        {actual && (
          <span className="pitch-board__legend">
            <b>C</b> Captain
          </span>
        )}
      </div>
    </aside>
  );
}

export function PitchIllustration() {
  return (
    <PitchFrame
      actual={false}
      label="Illustrative football formation"
      eyebrow="THE TACTICS BOARD"
      title="Every spot counts"
      formation={illustratedShirts.slice(1).join("–")}
      rows={illustratedShirts.map((count, index) =>
        Array.from({ length: count }, (_, shirt) => (
          <div
            className="pitch-board__player pitch-board__player--illustration"
            key={shirt}
          >
            <Shirt goalkeeper={index === 0} />
          </div>
        )),
      )}
      caption="Illustrative formation · your XI appears after analysis"
    />
  );
}

export function PitchBoard({
  data,
  lineup,
  week,
  variant,
  highlightIds,
  onPlayerSelect,
}: {
  data: Data;
  lineup: { ids: number[]; captain: number | null };
  week: number;
  variant: "before" | "after";
  highlightIds: number[];
  onPlayerSelect: (id: number) => void;
}) {
  const selected = lineup.ids.flatMap((id) => {
    const player = findPlayer(data.bootstrap.elements, id);
    return player ? [player] : [];
  });
  if (!selected.length) return <PitchIllustration />;
  const rows = positionRows.map((_, index) =>
    selected.filter((player) => player.element_type === index + 1),
  );
  return (
    <PitchFrame
      actual
      label={
        variant === "after"
          ? "Preview starting lineup"
          : "Baseline starting lineup"
      }
      eyebrow={`${variant === "after" ? "PREVIEW" : "BASELINE"} / MATCHDAY XI`}
      title="Your starting XI"
      formation={rows
        .slice(1)
        .map((row) => row.length)
        .join("–")}
      rows={rows.map((row, index) =>
        row.map((player) => {
          const captain = lineup.captain === player.id;
          const entered = highlightIds.includes(player.id);
          return (
            <PlayerLink
              className={`pitch-board__player${entered ? " pitch-board__player--entered" : ""}`}
              key={player.id}
              playerId={player.id}
              onSelect={onPlayerSelect}
              label={`View ${player.web_name} details${captain ? ", captain" : ""}${entered ? ", enters starting XI" : ""}`}
            >
              <div className="pitch-board__kit">
                <Shirt goalkeeper={index === 0} />
                {captain && (
                  <span className="pitch-board__captain" aria-label="Captain">
                    C
                  </span>
                )}
              </div>
              <span className="pitch-board__name">{player.web_name}</span>
              <span className="pitch-board__club">
                {findClub(data.bootstrap.teams, player.team)?.short_name}
              </span>
            </PlayerLink>
          );
        }),
      )}
      caption={`GW${week} · ${variant === "after" ? "Preview after selected transfers" : "Baseline, before a transfer"}`}
    />
  );
}
