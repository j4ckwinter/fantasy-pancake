import type { Lineup } from "@/lib/model";
import {
  expectedPoints,
  minus,
  signed,
  signedPoints,
  tenthsAddingUp,
} from "../format";
import "./weekly-breakdown.css";

export function WeeklyBreakdown({
  weeks,
  baseline,
  preview,
  hits,
  netGain,
}: {
  weeks: number[];
  baseline: Lineup[];
  preview: Lineup[];
  hits: number[];
  netGain: number;
}) {
  const rows = weeks.flatMap((week, index) => {
    const before = baseline[index];
    const after = preview[index];
    const hit = hits[index] ?? 0;
    return before && after
      ? [{ week, before: before.score, after: after.score, hit }]
      : [];
  });
  const net = tenthsAddingUp(
    rows.map(({ before, after, hit }) => after - before - hit),
    netGain,
  );
  const totalHit = rows.reduce((sum, row) => sum + row.hit, 0);
  return (
    <div className="weekly-breakdown">
      <div className="comparison-table-wrap">
        <table>
          <caption>Weekly starting XI and captain expected points</caption>
          <thead>
            <tr>
              <th scope="col">GW</th>
              <th scope="col">Keep squad</th>
              <th scope="col">After transfers</th>
              <th scope="col">Hit</th>
              <th scope="col">Net gain</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ week, before, after, hit }, index) => (
              <tr key={week}>
                <th scope="row">GW{week}</th>
                <td>{before.toFixed(1)}</td>
                <td>{after.toFixed(1)}</td>
                <td>{hit ? `${minus}${hit}` : "0"}</td>
                <td className={net[index] >= 0 ? "comparison-gain" : undefined}>
                  {signed(net[index])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="weekly-breakdown__totals">
        <div>
          <dt>Gross horizon gain</dt>
          <dd>{signedPoints(netGain + totalHit)}</dd>
        </div>
        <div>
          <dt>Transfer hits</dt>
          <dd>
            {totalHit
              ? `${minus}${expectedPoints(totalHit)}`
              : expectedPoints(0)}
          </dd>
        </div>
        <div>
          <dt>Net horizon gain</dt>
          <dd>{signedPoints(netGain)}</dd>
        </div>
      </dl>
      <p className="comparison-note">
        Expected FPL points. Weekly gains include changes to the optimised XI
        and captain, and each hit is taken in the gameweek its transfers are
        made. Net gains are rounded so they add up to the net horizon gain.
      </p>
    </div>
  );
}
