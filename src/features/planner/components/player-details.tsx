"use client";

import { useEffect, useId, useRef } from "react";
import { Button } from "@jack.winter/pancake-ui";
import { playerForecast, upcomingWeeks, usableHistory } from "@/lib/model";
import type { Data } from "@/lib/schemas";
import { money } from "../format";
import { FixtureStrip } from "./pitch-board";
import "./player-details.css";

export function PlayerDetails({
  data,
  playerId,
  onClose,
}: {
  data: Data;
  playerId: number | null;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const player = data.bootstrap.elements.find((item) => item.id === playerId);
  const open = !!player;
  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    const previousFocus = document.activeElement;
    element.showModal();
    return () => {
      element.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus();
    };
  }, [open]);
  if (!player) return null;
  const team = data.bootstrap.teams.find((item) => item.id === player.team);
  const forecast = playerForecast(data, player);
  const history = usableHistory(data, player);
  const percentage = (value: number) => `${Math.round(value * 100)}%`;
  return (
    <dialog
      ref={dialog}
      className="player-details"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose();
      }}
    >
      <header className="player-details__header">
        <div>
          <span className="eyebrow">PLAYER INTELLIGENCE</span>
          <h2 id={titleId}>{player.web_name}</h2>
          <p>
            {team?.name} · {money(player.now_cost)}
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={onClose}
          aria-label="Close player details"
        >
          Close
        </Button>
      </header>
      <div className="player-details__body">
        {player.news && (
          <p className="player-details__news">
            <strong>FPL news</strong> {player.news}
          </p>
        )}
        <section aria-labelledby={`${titleId}-forecast`}>
          <h3 id={`${titleId}-forecast`}>The model’s view</h3>
          <dl className="player-details__metrics">
            <div>
              <dt>Expected minutes / match</dt>
              <dd>{Math.round(forecast.minutes)}</dd>
            </div>
            <div>
              <dt>Expected goals / 90</dt>
              <dd>{forecast.xg90.toFixed(2)}</dd>
            </div>
            <div>
              <dt>Expected assists / 90</dt>
              <dd>{forecast.xa90.toFixed(2)}</dd>
            </div>
          </dl>
          <p className="player-details__note">
            {forecast.historyMatches
              ? "Model estimates, blended from recent matches and season data."
              : "Model estimates from season data; recent history is unavailable."}
          </p>
          <details className="player-details__context">
            <summary>Playing time and forecast context</summary>
            <dl className="player-details__supporting-metrics">
              <div>
                <dt>Start estimate</dt>
                <dd>{percentage(forecast.startProbability)}</dd>
              </div>
              <div>
                <dt>60+ min estimate</dt>
                <dd>{percentage(forecast.sixtyProbability)}</dd>
              </div>
              <div>
                <dt>Recent matches used</dt>
                <dd>
                  {forecast.historyMatches}
                  <small> / 8</small>
                </dd>
              </div>
              <div>
                <dt>Minutes when starting · recent</dt>
                <dd>
                  {forecast.recentStartMinutes === null
                    ? "—"
                    : Math.round(forecast.recentStartMinutes)}
                </dd>
              </div>
            </dl>
            <p className="player-details__note">
              Recent starting minutes are the observed average across{" "}
              {forecast.recentStartCount} starts in the latest four completed
              matches. Expected match minutes also include substitute
              appearances and non-appearances.
              {forecast.minutesBasis === "recent-starts" &&
                " Four consecutive starts give the recent role extra weight; older appearances are downweighted, not discarded."}
            </p>
            <p className="player-details__note">
              Usage estimates blend recent matches with season data. Percentages
              are model assumptions, not calibrated probabilities. Availability
              adjustments are applied separately when scoring your selected
              scenario.
            </p>
          </details>
        </section>
        <section aria-labelledby={`${titleId}-history`}>
          <h3 id={`${titleId}-history`}>Recent matches</h3>
          {history.length ? (
            <div className="player-details__table-wrap">
              <table>
                <caption>Latest completed fixtures, newest first</caption>
                <thead>
                  <tr>
                    <th scope="col">GW</th>
                    <th scope="col">Min</th>
                    <th scope="col">Start</th>
                    <th scope="col">xG</th>
                    <th scope="col">xA</th>
                    <th scope="col">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => (
                    <tr key={row.fixture}>
                      <th scope="row">{row.round}</th>
                      <td>{row.minutes}</td>
                      <td>{row.starts ? "Yes" : "No"}</td>
                      <td>{row.expected_goals.toFixed(2)}</td>
                      <td>{row.expected_assists.toFixed(2)}</td>
                      <td>{row.total_points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="player-details__empty">
              No eligible completed history is available. This forecast uses
              season data; it does not treat missing history as zero form.
            </p>
          )}
        </section>
        <section aria-labelledby={`${titleId}-fixtures`}>
          <h3 id={`${titleId}-fixtures`}>Next four gameweeks</h3>
          <FixtureStrip
            data={data}
            playerId={player.id}
            weeks={upcomingWeeks(data).slice(0, 4)}
          />
        </section>
        <details className="player-details__assumptions">
          <summary>What this forecast cannot know</summary>
          <p>
            Recent appearances do not establish future selection, a new tactical
            role or a recovery date. Fixture difficulty describes the schedule,
            not a guaranteed return. Transfer rankings compare the whole
            starting XI and captain, rather than this player’s last score alone.
          </p>
          <p>
            Penalty and set-piece roles are context, with no extra scoring
            bonus. Rare events such as red cards are smoothed so one match does
            not dominate the forecast.
          </p>
        </details>
      </div>
    </dialog>
  );
}
