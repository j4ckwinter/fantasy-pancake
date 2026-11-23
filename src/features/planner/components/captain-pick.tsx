import type { CaptainOption, Captaincy } from "@/lib/model";
import type { Data } from "@/lib/schemas";
import { expectedPoints } from "../format";
import { findPlayer } from "../players";
import { PlayerLink } from "./player-link";
import "./captain-pick.css";

type Role = "captain" | "vice" | "option";

const ROLE_MARK: Record<Role, string> = {
  captain: "C",
  vice: "V",
  option: "3",
};

const ROLE_LABEL: Record<Role, string> = {
  captain: "Captain",
  vice: "Vice-captain",
  option: "Third choice",
};

export function CaptainPick({
  data,
  captaincy,
  onPlayerSelect,
}: {
  data: Data;
  captaincy: Captaincy;
  onPlayerSelect: (id: number) => void;
}) {
  const name = (id: number) =>
    findPlayer(data.bootstrap.elements, id)?.web_name ?? "Unknown";
  const { captain, viceCaptain, otherOptions } = captaincy;
  const [third] = otherOptions;
  const gap = captain.gapToNext ?? 0;
  const ranked: [Role, CaptainOption][] = [
    ["captain", captain],
    ["vice", viceCaptain],
    ...(third ? [["option", third] as [Role, CaptainOption]] : []),
  ];
  return (
    <section
      className="captain-pick"
      aria-labelledby="captain-pick-title"
      data-testid="captain-pick"
    >
      <div className="captain-pick__header">
        <h3 id="captain-pick-title">Captain pick</h3>
        <span className="captain-pick__week">GW{captaincy.week}</span>
      </div>
      <ol className="captain-pick__options">
        {ranked.map(([role, option]) => (
          <li key={option.playerId}>
            <PlayerLink
              className={`captain-pick__option captain-pick__option--${role}`}
              playerId={option.playerId}
              onSelect={onPlayerSelect}
              label={`${ROLE_LABEL[role]}: ${name(option.playerId)}, ${expectedPoints(option.expectedPoints)}. View details`}
            >
              <span className="captain-pick__mark" aria-hidden="true">
                {ROLE_MARK[role]}
              </span>
              <span className="captain-pick__name">
                {name(option.playerId)}
              </span>
              <span className="captain-pick__points">
                {expectedPoints(option.expectedPoints)}
              </span>
            </PlayerLink>
          </li>
        ))}
      </ol>
      <p className="captain-pick__gap">
        {gap > 0
          ? `${expectedPoints(gap)} clear of ${name(viceCaptain.playerId)}. Points double as captain.`
          : `Level with ${name(viceCaptain.playerId)}. Points double as captain.`}
      </p>
    </section>
  );
}
