import { describe, expect, it } from "vitest";
import type { Player } from "../schemas";
import { bestLineup } from "./lineup";
import { bestAffordableSquad } from "./affordable-squad";
import { gameSettings, player, positionRules } from "./test-fixtures";

const rules = {
  bootstrap: { element_types: positionRules(), game_settings: gameSettings() },
};

type Spec = [position: number, club: number, price: number, points: number];

function market(specs: Spec[]) {
  const players: Player[] = specs.map(([position, club, price], index) =>
    player(index + 1, position, club, { now_cost: price }),
  );
  return {
    players,
    prices: new Map(players.map((p) => [p.id, p.now_cost])),
    scores: new Map(players.map((p, index) => [p.id, specs[index][3]])),
  };
}

describe("affordable squad search", () => {
  it("fills the bench from other clubs when the cheapest players share a club with the XI", () => {
    const specs: Spec[] = [
      [1, 15, 40, 3],
      [1, 16, 40, 0],
      ...Array.from({ length: 6 }, (): Spec => [2, 7, 40, 0]),
      ...Array.from({ length: 5 }, (_, i): Spec => [2, 8 + i, 45, 1]),
      ...Array.from({ length: 5 }, (_, i): Spec => [3, 1 + i, 60, 6]),
      ...Array.from({ length: 6 }, (_, i): Spec => [3, 15 + i, 40, 0]),
      ...Array.from({ length: 3 }, (): Spec => [4, 7, 70, 10]),
      ...Array.from({ length: 6 }, (_, i): Spec => [4, 15 + i, 40, 0]),
    ];
    const { players, prices, scores } = market(specs);
    const squad = bestAffordableSquad(rules, { players, prices, budget: 800 }, [
      scores,
    ]);
    expect(squad).not.toBeNull();
    expect(bestLineup(rules, squad!, scores).score).toBe(70);
  });
});
