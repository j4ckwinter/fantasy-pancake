import { Button } from "@jack.winter/pancake-ui";
import { playerForecast, type Move } from "@/lib/model";
import type { Data, Settings } from "@/lib/schemas";
import { money, signed, scoreGainLabel } from "../format";
import { FixtureStrip } from "./pitch-board";
import "./exploration.css";

export function GroupedTransfers({
  data,
  settings,
  moves,
  weeks,
  selectedKey,
  confirmedPrices,
  onSelect,
  onClearSelection,
  onPlayerSelect,
}: {
  data: Data;
  settings: Settings;
  moves: Move[];
  weeks: number[];
  selectedKey: string | null;
  confirmedPrices: number[];
  onSelect: (move: Move) => void;
  onPlayerSelect: (id: number) => void;
  onClearSelection: () => void;
}) {
  const groups = new Map<number, Move[]>();
  for (const move of moves) {
    const alternatives = groups.get(move.inId) ?? [];
    alternatives.push(move);
    groups.set(move.inId, alternatives);
  }
  return (
    <div className="transfer-groups">
      {[...groups].slice(0, 3).map(([inId, alternatives], index) => {
        const incoming = data.bootstrap.elements.find((p) => p.id === inId);
        if (!incoming) return null;
        const rows = alternatives.slice(0, 3);
        const gains = rows.map((move) => move.gain);
        const spread = Math.max(...gains) - Math.min(...gains);
        const close = rows.length > 1 && spread <= 1;
        return (
          <article className="card transfer-group" key={inId}>
            <div className="transfer-group-heading">
              <span className="option-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h3>
                  Buy{" "}
                  <button
                    className="player-detail-link"
                    type="button"
                    onClick={(event) => {
                      event.currentTarget.focus({ preventScroll: true });
                      onPlayerSelect(inId);
                    }}
                  >
                    {incoming.web_name}
                  </button>
                </h3>
                <p className="muted">
                  {
                    data.bootstrap.teams.find(
                      (team) => team.id === incoming.team,
                    )?.name
                  }{" "}
                  · {money(incoming.now_cost)}
                </p>
              </div>
            </div>
            <FixtureStrip data={data} playerId={inId} weeks={weeks} />
            {close && <p className="close-alternatives">Similar scores</p>}
            <div className="transfer-alternatives">
              {rows.map((move) => {
                const outgoing = data.bootstrap.elements.find(
                  (p) => p.id === move.outId,
                );
                const owned = settings.squad.find((p) => p.id === move.outId);
                if (!outgoing || !owned) return null;
                const key = `${move.outId}-${move.inId}`;
                const selected = selectedKey === key;
                return (
                  <div
                    className={`transfer-alternative${selected ? " is-selected" : ""}`}
                    key={key}
                  >
                    <div className="alternative-player">
                      <span className="eyebrow">Sell</span>
                      <button
                        className="player-detail-link"
                        type="button"
                        onClick={(event) => {
                          event.currentTarget.focus({ preventScroll: true });
                          onPlayerSelect(outgoing.id);
                        }}
                      >
                        {outgoing.web_name}
                      </button>
                      <span className="muted">
                        {Math.round(playerForecast(data, outgoing).minutes)}{" "}
                        expected mins
                      </span>
                    </div>
                    <div className="alternative-gain">
                      <strong>{signed(move.gain)}</strong>
                      <span>{scoreGainLabel(weeks)}</span>
                      {move.hit > 0 && (
                        <span className="alternative-hit">−{move.hit} hit</span>
                      )}
                    </div>
                    <div className="alternative-price">
                      <span>{money(move.remainingBank)} left</span>
                      {confirmedPrices.includes(move.outId) && (
                        <span className="alternative-price__checked">
                          Price checked
                        </span>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      className="preview-toggle"
                      aria-pressed={selected}
                      aria-label={`Preview ${outgoing.web_name} to ${incoming.web_name}`}
                      onClick={() =>
                        selected ? onClearSelection() : onSelect(move)
                      }
                    >
                      {selected ? "Selected" : "Preview"}
                    </Button>
                  </div>
                );
              })}
            </div>
          </article>
        );
      })}
    </div>
  );
}
