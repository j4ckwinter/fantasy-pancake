import { ArrowRightIcon, RotateCwIcon } from "lucide-react";
import { Banner } from "@/components/banner";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/field";
import { PitchIllustration } from "./pitch-board";
import "./import-team.css";
export function ImportTeam({
  ready,
  error,
  teamId,
  onTeamIdChange,
  onImport,
  onRetry,
}: {
  ready: boolean;
  error: string | null;
  teamId: string;
  onTeamIdChange: (value: string) => void;
  onImport: () => void;
  onRetry: () => void;
}) {
  const errorBanner = error && (
    <Banner tone="error" title="Something needs attention">
      {error}
    </Banner>
  );
  return (
    <section className="hero">
      <div className="hero-copy">
        <span className="eyebrow hero-eyebrow">
          <span className="hero-eyebrow__line" aria-hidden="true" />
          Your next gameweek starts here
        </span>
        <h1>
          PLAY THE
          <br />
          <em>LONG GAME.</em>
        </h1>
        <p className="hero-description">
          Compare transfers across the next four gameweeks using your FPL squad.
        </p>
        {ready ? (
          <section className="import-card">
            <h2>Bring your team. Find your edge.</h2>
            <p className="import-card__lead">
              Enter the team ID from your FPL points-page URL. No login needed.
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const focused = document.activeElement;
                if (
                  focused instanceof HTMLElement &&
                  event.currentTarget.contains(focused)
                ) {
                  focused.blur();
                }
                onImport();
              }}
              className="import-form"
            >
              <TextField
                className="import-form__field"
                label="FPL team ID"
                type="text"
                inputMode="numeric"
                pattern="[0-9]+"
                placeholder="e.g. 123456"
                value={teamId}
                onChange={(e) => {
                  if (/^[0-9]*$/.test(e.target.value)) {
                    onTeamIdChange(e.target.value);
                  }
                }}
                required
                aria-describedby="team-id-help"
              />
              <Button variant="brand" size="lg" type="submit">
                Import team
                <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
              </Button>
            </form>
            <p id="team-id-help" className="import-id-example">
              Example: /entry/<strong>123456</strong>/event/9
            </p>
            {errorBanner && (
              <div className="import-card__error">{errorBanner}</div>
            )}
          </section>
        ) : (
          <div className="import-unavailable">
            {errorBanner}
            <Button variant="brand" size="lg" onClick={onRetry}>
              <RotateCwIcon data-icon="inline-start" aria-hidden="true" />
              Retry loading data
            </Button>
          </div>
        )}
      </div>
      <PitchIllustration />
    </section>
  );
}
