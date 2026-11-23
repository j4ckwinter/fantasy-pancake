import { Button } from "@jack.winter/pancake-ui";
import { playerForecast, type Move } from "@/lib/model";
import type { Data } from "@/lib/schemas";
import { minus, money, signed, scoreGainLabel } from "../format";
import { FixtureStrip } from "./fixture-strip";
import { findClub, findPlayer } from "../players";
import { PlayerLink } from "./player-link";
import "./exploration.css";
import "./grouped-transfers.css";

export function GroupedTransfers({
  data,
  squadIds,
  moves,
  weeks,
  selectedKey,
  confirmedPrices,
  onSelect,
  onClearSelection,
  onPlayerSelect,
}: {
  data: Data;
  squadIds: number[];
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
        const incoming = findPlayer(data.bootstrap.elements, inId);
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
                  <PlayerLink
                    className="player-detail-link"
                    playerId={inId}
                    onSelect={onPlayerSelect}
                  >
                    {incoming.web_name}
                  </PlayerLink>
                </h3>
                <p className="muted">
                  {findClub(data.bootstrap.teams, incoming.team)?.name} ·{" "}
                  {money(incoming.now_cost)}
                </p>
              </div>
            </div>
            <FixtureStrip data={data} playerId={inId} weeks={weeks} />
            {close && <p className="close-alternatives">Similar scores</p>}
            <div className="transfer-alternatives">
              {rows.map((move) => {
                const outgoing = findPlayer(
                  data.bootstrap.elements,
                  move.outId,
                );
                if (!outgoing || !squadIds.includes(move.outId)) return null;
                const key = `${move.outId}-${move.inId}`;
                const selected = selectedKey === key;
                return (
                  <div
                    className={`transfer-alternative${selected ? " is-selected" : ""}`}
                    key={key}
                  >
                    <div className="alternative-player">
                      <span className="eyebrow">Sell</span>
                      <PlayerLink
                        className="player-detail-link"
                        playerId={outgoing.id}
                        onSelect={onPlayerSelect}
                      >
                        {outgoing.web_name}
                      </PlayerLink>
                      <span className="muted">
                        {Math.round(playerForecast(data, outgoing).minutes)}{" "}
                        expected mins
                      </span>
                    </div>
                    <div className="alternative-gain">
                      <strong>{signed(move.gain)}</strong>
                      <span>{scoreGainLabel(weeks)}</span>
                      {move.hit > 0 && (
                        <span className="alternative-hit">
                          {minus}
                          {move.hit} hit
                        </span>
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
