import { money, signed, scoreGainLabel } from "../format";

export function PreviewMetrics({
  gain,
  hit,
  remainingBank,
  weeks,
  pricesChecked,
}: {
  gain: number;
  hit: number;
  remainingBank: number;
  weeks: number[];
  pricesChecked: boolean;
}) {
  return (
    <div className="metrics">
      <div className="metric">
        <strong>{signed(gain)}</strong>
        <span>{scoreGainLabel(weeks)}</span>
      </div>
      <div className="metric">
        <strong>{hit} pts</strong>
        <span>Transfer hit</span>
      </div>
      <div className="metric">
        <strong>{money(remainingBank)}</strong>
        <span>{pricesChecked ? "Bank after move" : "Estimated bank"}</span>
      </div>
    </div>
  );
}
