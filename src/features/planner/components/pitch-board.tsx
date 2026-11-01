import type { Data } from "@/lib/schemas";
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

export function PitchBoard({
  data,
  lineup,
  week,
  variant = "before",
  highlightIds = [],
  onPlayerSelect,
}: {
  data?: Data | null;
  lineup?: { ids: number[]; captain: number | null };
  week?: number;
  variant?: "before" | "after";
  highlightIds?: number[];
  onPlayerSelect?: (id: number) => void;
}) {
  const selected =
    data && lineup
      ? lineup.ids.flatMap((id) => {
          const player = data.bootstrap.elements.find((item) => item.id === id);
          return player ? [player] : [];
        })
      : [];
  const actual = selected.length > 0;
  const PlayerTag = onPlayerSelect ? "button" : "div";
  const rows = [1, 2, 3, 4].map((position) =>
    selected.filter((player) => player.element_type === position),
  );
  const formation = actual
    ? rows
        .slice(1)
        .map((row) => row.length)
        .join("–")
    : "4–4–2";
  return (
    <aside
      className={`pitch-board${actual ? " pitch-board--actual" : " pitch-board--illustration"}`}
      aria-label={
        actual
          ? variant === "after"
            ? "Preview starting lineup"
            : "Baseline starting lineup"
          : "Illustrative football formation"
      }
    >
      <div className="pitch-board__header">
        <div>
          <span className="pitch-board__eyebrow">
            <span className="pitch-board__signal" />
            {actual
              ? `${variant === "after" ? "PREVIEW" : "BASELINE"} / MATCHDAY XI`
              : "THE TACTICS BOARD"}
          </span>
          <h2>{actual ? "Your starting XI" : "Every spot counts"}</h2>
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
              data-position={["GK", "DEF", "MID", "FWD"][index]}
              key={index}
            >
              {actual
                ? row.map((player) => (
                    <PlayerTag
                      className={`pitch-board__player${highlightIds.includes(player.id) ? " pitch-board__player--entered" : ""}`}
                      key={player.id}
                      type={onPlayerSelect ? "button" : undefined}
                      onClick={
                        onPlayerSelect
                          ? (event) => {
                              // Safari does not focus buttons on pointer activation.
                              event.currentTarget.focus({
                                preventScroll: true,
                              });
                              onPlayerSelect(player.id);
                            }
                          : undefined
                      }
                      aria-label={
                        onPlayerSelect
                          ? `View ${player.web_name} details${lineup?.captain === player.id ? ", captain" : ""}${highlightIds.includes(player.id) ? ", enters starting XI" : ""}`
                          : undefined
                      }
                    >
                      <div className="pitch-board__kit">
                        <Shirt goalkeeper={index === 0} />
                        {lineup?.captain === player.id && (
                          <span
                            className="pitch-board__captain"
                            aria-label="Captain"
                          >
                            C
                          </span>
                        )}
                      </div>
                      <span className="pitch-board__name">
                        {player.web_name}
                      </span>
                      <span className="pitch-board__club">
                        {
                          data?.bootstrap.teams.find(
                            (team) => team.id === player.team,
                          )?.short_name
                        }
                      </span>
                    </PlayerTag>
                  ))
                : Array.from({ length: [1, 4, 4, 2][index] }, (_, shirt) => (
                    <div
                      className="pitch-board__player pitch-board__player--illustration"
                      key={shirt}
                    >
                      <Shirt goalkeeper={index === 0} />
                    </div>
                  ))}
            </div>
          ))}
        </div>
      </div>
      <div className="pitch-board__footer">
        <p className="pitch-board__caption">
          {actual
            ? `${week ? `GW${week} · ` : ""}${variant === "after" ? "Preview after selected transfers" : "Baseline, before a transfer"}`
            : "Illustrative formation · your XI appears after analysis"}
        </p>
        {actual && (
          <span className="pitch-board__legend">
            <b>C</b> Captain
          </span>
        )}
      </div>
    </aside>
  );
}

export function FixtureStrip({
  data,
  playerId,
  weeks,
}: {
  data: Data;
  playerId: number;
  weeks: number[];
}) {
  const player = data.bootstrap.elements.find((item) => item.id === playerId);
  return (
    <div
      className="fixture-strip"
      aria-label="Upcoming fixtures and difficulty"
    >
      {weeks.map((week) => {
        const fixtures = player
          ? data.fixtures.filter(
              (fixture) =>
                fixture.event === week &&
                !fixture.finished &&
                (fixture.team_h === player.team ||
                  fixture.team_a === player.team),
            )
          : [];
        return (
          <div className="fixture-strip__week" key={week}>
            <span className="fixture-strip__label">GW{week}</span>
            {fixtures.length ? (
              fixtures.map((fixture) => {
                const home = fixture.team_h === player?.team;
                const opponent = data.bootstrap.teams.find(
                  (team) =>
                    team.id === (home ? fixture.team_a : fixture.team_h),
                );
                const difficulty = home
                  ? fixture.team_h_difficulty
                  : fixture.team_a_difficulty;
                return (
                  <div
                    className={`fixture-strip__match fixture-strip__match--${difficulty}`}
                    key={fixture.id}
                  >
                    <strong>
                      {opponent?.short_name ?? "TBC"}{" "}
                      <span>({home ? "H" : "A"})</span>
                    </strong>
                    <span className="fixture-strip__difficulty">
                      <span className="fixture-strip__difficulty-label">
                        Difficulty{" "}
                      </span>
                      {difficulty}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="fixture-strip__match fixture-strip__match--blank">
                <strong>Blank</strong>
                <span className="fixture-strip__difficulty">No fixture</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
