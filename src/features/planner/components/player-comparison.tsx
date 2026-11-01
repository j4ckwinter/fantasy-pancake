import { playerForecast } from "@/lib/model";
import type { Data } from "@/lib/schemas";
import { money } from "../format";
import { FixtureStrip } from "./pitch-board";
import "./comparison-panels.css";

export function PlayerComparison({
  data,
  outId,
  inId,
  weeks,
}: {
  data: Data;
  outId: number;
  inId: number;
  weeks: number[];
}) {
  const outgoing = data.bootstrap.elements.find(
    (player) => player.id === outId,
  );
  const incoming = data.bootstrap.elements.find((player) => player.id === inId);
  if (!outgoing || !incoming) return null;
  const players = [outgoing, incoming].map((player, index) => ({
    player,
    role: index === 0 ? "Outgoing" : "Incoming",
    forecast: playerForecast(data, player),
  }));
  return (
    <div className="player-comparison">
      <table className="player-comparison__table">
        <caption>
          Playing time and attacking threat
          <span>Model estimates · recent matches blended with season data</span>
        </caption>
        <thead>
          <tr>
            <th scope="col">Metric</th>
            {players.map(({ player, role }) => (
              <th scope="col" key={role}>
                <span className="eyebrow">{role}</span>
                <strong>{player.web_name}</strong>
                <span className="player-comparison__price">
                  {money(player.now_cost)} market price
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">
              Expected minutes <small>per match</small>
            </th>
            {players.map(({ role, forecast }) => (
              <td key={role}>{Math.round(forecast.minutes)}</td>
            ))}
          </tr>
          <tr>
            <th scope="row">
              Expected goals <small>per 90 minutes · xG</small>
            </th>
            {players.map(({ role, forecast }) => (
              <td key={role}>{forecast.xg90.toFixed(2)}</td>
            ))}
          </tr>
          <tr>
            <th scope="row">
              Expected assists <small>per 90 minutes · xA</small>
            </th>
            {players.map(({ role, forecast }) => (
              <td key={role}>{forecast.xa90.toFixed(2)}</td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className="comparison-note">
        Per-90 rates compare attacking threat on equal playing time. Expected
        minutes show how much of that threat a player may deliver each match.
        Fixtures and availability also affect the final score.
      </p>
      <details className="player-comparison__context">
        <summary>Recent usage and forecast context</summary>
        {players.map(({ player, role, forecast }) => (
          <p key={role}>
            <strong>{player.web_name}:</strong>{" "}
            {forecast.recentStartMinutes === null
              ? "No starts in the latest four available matches."
              : `${Math.round(forecast.recentStartMinutes)} minutes per start across ${forecast.recentStartCount} starts in the latest four available matches.`}{" "}
            {forecast.historyMatches === 0
              ? "No recent history available; season estimates used."
              : `${forecast.historyMatches} recent matches used in the forecast.`}
          </p>
        ))}
        <p>
          Expected minutes include substitute appearances and non-appearances.
          Four consecutive completed starts give recent usage extra weight.
          These estimates are not raw form or guaranteed returns. Availability
          is applied separately in lineup scoring. Market prices may differ from
          your selling prices.
        </p>
      </details>
      <div className="player-comparison__fixtures">
        {players.map(({ player, role }) => (
          <section
            key={role}
            aria-label={`${role}: ${player.web_name} fixtures`}
          >
            <h4>{player.web_name} · fixtures</h4>
            <FixtureStrip data={data} playerId={player.id} weeks={weeks} />
          </section>
        ))}
      </div>
    </div>
  );
}
