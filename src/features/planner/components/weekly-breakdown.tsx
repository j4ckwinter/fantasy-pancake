import type { Lineup } from "@/lib/model";
import { signed } from "../format";
import "./comparison-panels.css";

export function WeeklyBreakdown({
  weeks,
  baseline,
  preview,
  hit,
  netGain,
}: {
  weeks: number[];
  baseline: Lineup[];
  preview: Lineup[];
  hit: number;
  netGain: number;
}) {
  const rows = weeks.flatMap((week, index) => {
    const before = baseline[index];
    const after = preview[index];
    return before && after
      ? [{ week, before: before.score, after: after.score }]
      : [];
  });
  return (
    <div className="weekly-breakdown">
      <div className="comparison-table-wrap">
        <table>
          <caption>Weekly starting XI and captain scores</caption>
          <thead>
            <tr>
              <th scope="col">GW</th>
              <th scope="col">Keep squad</th>
              <th scope="col">With move</th>
              <th scope="col">Gain</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ week, before, after }) => (
              <tr key={week}>
                <th scope="row">GW{week}</th>
                <td>{before.toFixed(1)}</td>
                <td>{after.toFixed(1)}</td>
                <td className={after >= before ? "comparison-gain" : undefined}>
                  {signed(after - before)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="weekly-breakdown__totals">
        <div>
          <dt>Gross horizon gain</dt>
          <dd>{signed(netGain + hit)}</dd>
        </div>
        <div>
          <dt>Transfer hit · deducted once</dt>
          <dd>{hit ? `−${hit.toFixed(1)}` : "0.0"}</dd>
        </div>
        <div>
          <dt>Net horizon gain</dt>
          <dd>{signed(netGain)}</dd>
        </div>
      </dl>
      <p className="comparison-note">
        Heuristic score units, not projected FPL points. Weekly gains include
        changes to the optimised XI and captain. The hit is deducted from the
        horizon total once; displayed weekly values may differ slightly from
        totals due to rounding.
      </p>
    </div>
  );
}
