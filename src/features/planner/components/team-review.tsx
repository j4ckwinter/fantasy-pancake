import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  ChevronUpIcon,
  CircleAlertIcon,
  PencilIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextField, SelectField } from "@/components/field";
import { Banner } from "@/components/banner";
import { Disclosure } from "@/components/disclosure";
import { StatusBadge } from "@/components/status-badge";
import { freeTransferCap, TRANSFER_HIT_POINTS } from "@/lib/model";
import type { Data, Settings } from "@/lib/schemas";
import { SquadEditor } from "./squad-editor";
import { noticeText, type Notice } from "../messages";
import { fromMillions, teamLabel, toMillions } from "../format";
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
  notice: Notice | null;
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
  const maxTransfers = freeTransferCap(data.bootstrap.game_settings);
  return (
    <section
      className={`team-settings${editingTeam ? " team-settings--expanded" : ""}`}
    >
      <header className="team-settings-header">
        <div className="team-settings-header__title">
          <span className="eyebrow">
            {teamLabel(settings)} · GW
            {settings.sourceGameweek} picks
          </span>
          <h1>Your team</h1>
        </div>
        <Button
          type="button"
          variant="outline"
          className="team-settings-switch"
          disabled={busy}
          onClick={onImportAnother}
        >
          Switch team
          <ArrowUpRightIcon aria-hidden="true" className="size-4" />
        </Button>
      </header>
      <form
        className="team-settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          if (canReturnToShortlist && !hasTeamEdits) onCancel();
          else onCompare();
        }}
      >
        {notice && <p className="team-settings-note">{noticeText[notice]}</p>}
        <div className="settings-grid">
          <TextField
            label="Bank balance (£m)"
            type="number"
            min="0"
            max="100"
            step="0.1"
            required
            value={
              Number.isFinite(settings.bank) ? toMillions(settings.bank) : ""
            }
            onChange={(e) =>
              onUpdate({
                ...settings,
                bank: fromMillions(e.target.valueAsNumber),
              })
            }
          />
          <SelectField
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
          </SelectField>
        </div>
        {settings.freeTransfers === 0 && (
          <p className="team-settings-cost">
            <CircleAlertIcon aria-hidden="true" className="size-4" />
            <span>
              Your next transfer costs{" "}
              <strong>{TRANSFER_HIT_POINTS} points</strong>.
            </span>
          </p>
        )}
        <div className="team-settings-advanced">
          <Disclosure summary="Advanced options">
            <SelectField
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
            </SelectField>
            {settings.availabilityScenario === "recover-next-week" && (
              <p className="team-settings-hint">
                Recovery is a what-if scenario, not a predicted return date.
              </p>
            )}
          </Disclosure>
        </div>
        {errors.length > 0 && (
          <div className="team-settings-problems">
            <Banner title="Check your squad" tone="warning">
              <ul>
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Banner>
          </div>
        )}
        <div className="squad-summary-heading">
          <div>
            <h3>
              Your squad{" "}
              <StatusBadge tone="neutral">{settings.squad.length}</StatusBadge>
            </h3>
            <p>Made a move already? Update your picks.</p>
          </div>
          <Button
            type="button"
            variant="outline"
            aria-expanded={editingTeam}
            onClick={onToggleEditing}
          >
            {editingTeam ? (
              <ChevronUpIcon aria-hidden="true" className="size-4" />
            ) : (
              <PencilIcon aria-hidden="true" className="size-4" />
            )}
            {editingTeam ? "Hide players" : "Edit team"}
          </Button>
        </div>
        {editingTeam && (
          <SquadEditor
            data={data}
            settings={settings}
            onChange={onUpdateSquad}
          />
        )}
        <div className="confirm-footer">
          {canReturnToShortlist && hasTeamEdits && (
            <Button
              type="button"
              variant="ghost"
              className="team-settings-discard"
              disabled={busy}
              onClick={onCancel}
            >
              Discard changes
            </Button>
          )}
          <Button
            variant="brand"
            type="submit"
            className="team-settings-submit"
            disabled={busy || errors.length > 0}
          >
            {canReturnToShortlist && !hasTeamEdits
              ? "View shortlist"
              : "Save & view shortlist"}
            <ArrowRightIcon aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </form>
    </section>
  );
}
