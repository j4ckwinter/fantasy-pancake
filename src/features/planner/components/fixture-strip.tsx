import type { Data } from "@/lib/schemas";
import { findClub, findPlayer } from "../players";
import "./pitch-board.css";

export function FixtureStrip({
  data,
  playerId,
  weeks,
}: {
  data: Data;
  playerId: number;
  weeks: number[];
}) {
  const player = findPlayer(data.bootstrap.elements, playerId);
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
                const opponent = findClub(
                  data.bootstrap.teams,
                  home ? fixture.team_a : fixture.team_h,
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
