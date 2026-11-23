import type { Data, Fixture, Player } from "../schemas";

export type OpponentFactors = { attack: number; conceded: number };

const MIN_STRENGTH_FACTOR = 0.65;
const MAX_STRENGTH_FACTOR = 1.45;
const NEUTRAL_DIFFICULTY = 3;
const ATTACK_CHANGE_PER_DIFFICULTY = 0.12;
const CONCEDED_CHANGE_PER_DIFFICULTY = 0.15;

export function opponentFactors(
  data: Data,
  player: Player,
  fixture: Fixture,
): OpponentFactors {
  const home = fixture.team_h === player.team;
  const opponent = data.bootstrap.teams.find(
    (team) => team.id === (home ? fixture.team_a : fixture.team_h),
  );
  const difficulty = home
    ? fixture.team_h_difficulty
    : fixture.team_a_difficulty;
  const defenceKey = home ? "strength_defence_away" : "strength_defence_home";
  const attackKey = home ? "strength_attack_away" : "strength_attack_home";
  const ratio = (
    key: typeof defenceKey | typeof attackKey,
    inverse: boolean,
    fallback: number,
  ) => {
    const values = data.bootstrap.teams
      .map((team) => team[key])
      .filter(
        (value): value is number => typeof value === "number" && value > 0,
      );
    const value = opponent?.[key];
    if (!value || values.length < 2) return fallback;
    const average =
      values.reduce((sum, current) => sum + current, 0) / values.length;
    return Math.max(
      MIN_STRENGTH_FACTOR,
      Math.min(
        MAX_STRENGTH_FACTOR,
        inverse ? average / value : value / average,
      ),
    );
  };
  return {
    attack: ratio(
      defenceKey,
      true,
      1 + (NEUTRAL_DIFFICULTY - difficulty) * ATTACK_CHANGE_PER_DIFFICULTY,
    ),
    conceded: ratio(
      attackKey,
      false,
      1 + (difficulty - NEUTRAL_DIFFICULTY) * CONCEDED_CHANGE_PER_DIFFICULTY,
    ),
  };
}
