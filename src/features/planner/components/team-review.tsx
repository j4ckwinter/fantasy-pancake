import {
  BannerToast,
  Button,
  Select,
  TextField,
} from "@jack.winter/pancake-ui";
import type { Data, Settings } from "@/lib/schemas";
import { SquadEditor } from "./squad-editor";
import "./team-review.css";
export function TeamReview({
  data,
  settings,
  busy,
  notice,
  editingTeam,
  errors,
  onImportAnother,
  canReturnToShortlist,
  hasTeamEdits,
  onCancel,
  onCompare,
  onToggleEditing,
  onUpdate,
  onUpdateSquad,
}: {
  data: Data;
  settings: Settings;
  busy: boolean;
  notice: string;
  editingTeam: boolean;
  errors: string[];
  onImportAnother: () => void;
  canReturnToShortlist: boolean;
  hasTeamEdits: boolean;
  onCancel: () => void;
  onCompare: () => void;
  onToggleEditing: () => void;
  onUpdate: (settings: Settings) => void;
  onUpdateSquad: (settings: Settings) => void;
}) {
  const maxTransfers =
    1 + data.bootstrap.game_settings.max_extra_free_transfers;
  return (
    <section
      className={`team-settings${editingTeam ? " team-settings--expanded" : ""}`}
    >
      <header className="team-settings-header">
        <div>
          <span className="eyebrow">
            {settings.teamName || `Team #${settings.entryId}`} · GW
            {settings.sourceGameweek} picks
          </span>
          <h1>Your team</h1>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={onImportAnother}
        >
          Switch team ↗
        </Button>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          if (canReturnToShortlist && !hasTeamEdits) onCancel();
          else onCompare();
        }}
      >
        {notice && <p className="team-settings-note">{notice}</p>}
        <div className="settings-grid">
          <TextField
            label="Bank balance (£m)"
            type="number"
            min="0"
            max="100"
            step="0.1"
            required
            value={Number.isFinite(settings.bank) ? settings.bank / 10 : ""}
            onChange={(e) =>
              onUpdate({
                ...settings,
                bank: Math.round(e.target.valueAsNumber * 10),
              })
            }
          />
          <Select
            label="Free transfers remaining"
            value={settings.freeTransfers}
            onChange={(e) =>
              onUpdate({
                ...settings,
                freeTransfers: Number(e.target.value),
              })
            }
          >
            {Array.from({ length: maxTransfers + 1 }, (_, i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </Select>
        </div>
        {settings.freeTransfers === 0 && (
          <p className="team-settings-note">
            Your next transfer costs 4 points.
          </p>
        )}
        <details className="forecast-settings">
          <summary>Advanced options</summary>
          <Select
            label="Availability assumption"
            value={settings.availabilityScenario ?? "persistent"}
            onChange={(event) =>
              onUpdate({
                ...settings,
                availabilityScenario:
                  event.target.value === "recover-next-week"
                    ? "recover-next-week"
                    : "persistent",
              })
            }
          >
            <option value="persistent">Current availability persists</option>
            <option value="recover-next-week">
              Flagged players recover after next gameweek
            </option>
          </Select>
          {settings.availabilityScenario === "recover-next-week" && (
            <p className="muted">
              Recovery is a what-if scenario, not a predicted return date.
            </p>
          )}
        </details>
        {errors.length > 0 && (
          <div className="notice">
            <BannerToast title="Check your squad" tone="warning">
              <ul>
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </BannerToast>
          </div>
        )}
        <div className="section-title squad-summary-heading">
          <div>
            <h3>
              Your squad <span>{settings.squad.length}</span>
            </h3>
            <p className="muted">Made a move already? Update your picks.</p>
          </div>
          <Button
            type="button"
            variant="secondary"
            aria-expanded={editingTeam}
            onClick={onToggleEditing}
          >
            {editingTeam ? "Hide players" : "Edit team"}
          </Button>
        </div>
        {editingTeam && (
          <SquadEditor
            data={data}
            settings={settings}
            editing={editingTeam}
            onChange={onUpdateSquad}
          />
        )}
        <div className="confirm-footer">
          {canReturnToShortlist && hasTeamEdits && (
            <Button
              type="button"
              variant="secondary"
              className="team-settings-discard"
              disabled={busy}
              onClick={onCancel}
            >
              Discard changes
            </Button>
          )}
          <Button
            variant="secondary"
            type="submit"
            disabled={busy || errors.length > 0}
          >
            {canReturnToShortlist && !hasTeamEdits
              ? "View shortlist →"
              : "Save & view shortlist →"}
          </Button>
        </div>
      </form>
    </section>
  );
}
