import { Button, TextField } from "@jack.winter/pancake-ui";
import { PitchIllustration } from "./pitch-board";
import "./import-team.css";
import "./landing.css";
export function ImportTeam({
  ready,
  teamId,
  onTeamIdChange,
  onImport,
}: {
  ready: boolean;
  teamId: string;
  onTeamIdChange: (value: string) => void;
  onImport: () => void;
}) {
  return (
    <section className="hero">
      <div className="hero-copy">
        <span className="eyebrow">
          <span className="eyebrow-line" /> YOUR NEXT GAMEWEEK STARTS HERE
        </span>
        <h1>
          PLAY THE
          <br />
          <em>LONG GAME.</em>
        </h1>
        <p className="hero-description">
          Compare transfers across the next four gameweeks using your FPL squad.
        </p>
        {ready && (
          <section className="import-card">
            <h2>Bring your team. Find your edge.</h2>
            <p className="muted">
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
              <Button type="submit">Import team →</Button>
            </form>
            <p id="team-id-help" className="import-id-example">
              Example: /entry/<strong>123456</strong>/event/9
            </p>
          </section>
        )}
      </div>
      <PitchIllustration />
    </section>
  );
}
