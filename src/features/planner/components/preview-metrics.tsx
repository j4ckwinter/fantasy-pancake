import {
  expectedGainLabel,
  expectedPoints,
  money,
  signedPoints,
} from "../format";
import "./preview-metrics.css";

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
        <strong>{signedPoints(gain)}</strong>
        <span>{expectedGainLabel(weeks)}</span>
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

export function ChipMetrics({
  gain,
  weeks,
  threshold,
}: {
  gain: number;
  weeks: number[];
  threshold: number;
}) {
  return (
    <div className="metrics metrics--pair">
      <div className="metric">
        <strong>{signedPoints(gain)}</strong>
        <span>{expectedGainLabel(weeks)}</span>
      </div>
      <div className="metric">
        <strong>{expectedPoints(threshold)}</strong>
        <span>Play only above</span>
      </div>
    </div>
  );
}
