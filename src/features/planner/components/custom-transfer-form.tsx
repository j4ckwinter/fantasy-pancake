import { useState } from "react";
import { Button, Select } from "@jack.winter/pancake-ui";
import type { Data, Settings } from "@/lib/schemas";
import type { Selection } from "../selection";
import { money } from "../format";
import { PlayerPicker } from "./player-picker";
import "./exploration.css";

export function CustomTransferForm({
  data,
  settings,
  busy,
  error,
  onCompare,
  onViewDetails,
  selection,
  previewError,
  threshold,
}: {
  onViewDetails: () => void;
  selection: Selection | null;
  previewError: string;
  threshold: number;
  data: Data;
  settings: Settings;
  busy: boolean;
  error: string;
  onCompare: (outId: number, inId: number) => void;
}) {
  const [outDraft, setOutDraft] = useState<number | null>(null);
  const [inDraft, setInDraft] = useState<number | null>(null);
  const [submittedKey, setSubmittedKey] = useState<string | null>(null);
  const ownedIds = new Set(settings.squad.map((player) => player.id));
  const locks = new Set(settings.lockedPlayerIds ?? []);
  const owned = data.bootstrap.elements.filter((player) =>
    ownedIds.has(player.id),
  );
  const outgoing = owned.find(
    (player) => player.id === outDraft && !locks.has(player.id),
  );
  const hasUnlockedPlayer = owned.some((player) => !locks.has(player.id));
  const candidates = data.bootstrap.elements
    .filter(
      (player) =>
        player.element_type === outgoing?.element_type &&
        player.can_select &&
        player.can_transact &&
        !ownedIds.has(player.id),
    )
    .sort((a, b) => a.web_name.localeCompare(b.web_name));
  const incoming = candidates.find((player) => player.id === inDraft);
  const draftKey = `${outgoing?.id}-${incoming?.id}`;
  const currentError = submittedKey === draftKey ? error : "";
  const compared =
    selection?.custom &&
    selection.move?.outId === outgoing?.id &&
    selection.move?.inId === incoming?.id
      ? selection.move
      : null;
  return (
    <form
      className="custom-transfer-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (outgoing && incoming && !busy) {
          setSubmittedKey(draftKey);
          onCompare(outgoing.id, incoming.id);
        }
      }}
    >
      <div className="custom-transfer-fields">
        <Select
          label="Player to sell"
          value={outgoing?.id ?? ""}
          disabled={busy || !hasUnlockedPlayer}
          onChange={(event) => {
            setOutDraft(Number(event.target.value));
            setInDraft(null);
          }}
        >
          <option value="">
            {hasUnlockedPlayer
              ? "Choose a player to sell"
              : "Unlock a player to compare"}
          </option>
          {data.bootstrap.element_types.map((position) => (
            <optgroup key={position.id} label={position.singular_name_short}>
              {owned
                .filter((player) => player.element_type === position.id)
                .map((player) => (
                  <option
                    key={player.id}
                    value={player.id}
                    disabled={locks.has(player.id)}
                  >
                    {player.web_name} ·{" "}
                    {
                      data.bootstrap.teams.find(
                        (team) => team.id === player.team,
                      )?.short_name
                    }{" "}
                    ·{" "}
                    {money(
                      settings.squad.find((pick) => pick.id === player.id)!
                        .sellingPrice,
                    )}
                    {locks.has(player.id) ? " · kept" : ""}
                  </option>
                ))}
            </optgroup>
          ))}
        </Select>
        <PlayerPicker
          key={outgoing?.id ?? "no-outgoing"}
          players={candidates}
          teams={data.bootstrap.teams}
          value={incoming?.id ?? null}
          disabled={busy || !outgoing}
          onChange={setInDraft}
        />
      </div>
      <div className="custom-transfer-submit">
        <p className="muted">
          Compare a player in the same position. Your squad stays unchanged.
        </p>
        <Button type="submit" disabled={busy || !outgoing || !incoming}>
          {busy ? "Comparing…" : "Compare my transfer"}
        </Button>
      </div>
      {compared && !busy && !currentError && (
        <div className="custom-comparison-result" role="status">
          {previewError ? (
            <p>{previewError}</p>
          ) : (
            <>
              <p>
                {compared.gain > threshold
                  ? "Above the shortlist threshold."
                  : "Below the shortlist threshold."}
              </p>
              <a
                href="#selected-option"
                onClick={(event) => {
                  event.preventDefault();
                  onViewDetails();
                }}
              >
                View comparison details
              </a>
            </>
          )}
        </div>
      )}
      {currentError && (
        <p role="alert" className="custom-transfer-error">
          {currentError}
        </p>
      )}
    </form>
  );
}
