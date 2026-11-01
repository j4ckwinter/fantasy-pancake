import { describe, expect, it } from "vitest";
import type { Data, Player, Settings } from "../schemas";
import { analyze } from "../model";
import { bestLineup } from "./lineup";
import { planTransfers } from "./planning";
import { excessClubIds } from "./squad-rules";

function player(id: number, position: number, team: number, cost = 50): Player {
  return {
    id,
    element_type: position,
    team,
    now_cost: cost,
    web_name: `Player ${id}`,
    status: "a",
    news: "",
    can_select: true,
    can_transact: true,
    chance_of_playing_next_round: 100,
    minutes: 900,
    starts: 10,
    expected_goals: 1,
    expected_assists: 1,
    expected_goals_conceded: 10,
    defensive_contribution: 50,
    saves: 10,
    creativity: 10,
    penalties_order: null,
    corners_and_indirect_freekicks_order: null,
    direct_freekicks_order: null,
  };
}
function setup() {
  const positions = [1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4];
  const squad = positions.map((position, index) =>
    player(index + 1, position, Math.floor(index / 3) + 1),
  );
  const data: Data = {
    fetchedAt: "2026-10-01T12:00:00Z",
    fixtures: [],
    bootstrap: {
      elements: [...squad],
      teams: [],
      events: [],
      element_types: [
        {
          id: 1,
          singular_name_short: "GK",
          squad_select: 2,
          squad_min_play: 1,
          squad_max_play: 1,
        },
        {
          id: 2,
          singular_name_short: "DEF",
          squad_select: 5,
          squad_min_play: 3,
          squad_max_play: 5,
        },
        {
          id: 3,
          singular_name_short: "MID",
          squad_select: 5,
          squad_min_play: 2,
          squad_max_play: 5,
        },
        {
          id: 4,
          singular_name_short: "FWD",
          squad_select: 3,
          squad_min_play: 1,
          squad_max_play: 3,
        },
      ],
      game_settings: {
        squad_squadsize: 15,
        squad_squadplay: 11,
        squad_team_limit: 3,
        max_extra_free_transfers: 4,
      },
    },
  };
  const settings: Settings = {
    version: 1,
    season: "2026",
    entryId: 1,
    sourceGameweek: 1,
    bank: 0,
    freeTransfers: 2,
    squad: squad.map((p) => ({ id: p.id, sellingPrice: p.now_cost })),
  };
  const scores = [
    new Map(squad.map((p) => [p.id, 1])),
    new Map(squad.map((p) => [p.id, 1])),
  ];
  const baseline = scores.map((values) => bestLineup(data, squad, values));
  const run = (weeks = [2, 3]) =>
    planTransfers(
      data,
      settings,
      weeks,
      squad,
      scores.slice(0, weeks.length),
      baseline.slice(0, weeks.length),
      2,
    );
  function add(p: Player, values: number[]) {
    data.bootstrap.elements.push(p);
    scores.forEach((map, i) => map.set(p.id, values[i]));
  }
  return { data, settings, squad, scores, baseline, run, add };
}

describe("bounded transfer planning", () => {
  it("uses combined sale proceeds for an otherwise unaffordable upgrade", () => {
    const { run, add } = setup();
    add(player(100, 4, 6, 70), [20, 20]);
    add(player(101, 2, 7, 30), [1, 1]);
    const plans = run();
    const pair = plans.find((plan) => plan.kind === "pair-now")!;
    expect(pair.actions.map((action) => action.inId).sort()).toEqual([
      100, 101,
    ]);
    expect(pair.remainingBank).toBe(0);
    expect(plans.some((plan) => plan.kind === "roll-then-transfer")).toBe(
      false,
    );
  });
  it("charges each uncovered transfer once for zero, one and two free transfers", () => {
    const { settings, run, add } = setup();
    add(player(100, 4, 6), [20, 20]);
    add(player(101, 3, 7), [15, 15]);
    const pairs = [0, 1, 2].map((freeTransfers) => {
      settings.freeTransfers = freeTransfers;
      return run().find((plan) => plan.kind === "pair-now")!;
    });
    expect(pairs.map((plan) => plan.hit)).toEqual([8, 4, 0]);
    expect(pairs[0].gain).toBeCloseTo(pairs[2].gain - 8);
    expect(pairs[1].gain).toBeCloseTo(pairs[2].gain - 4);
    expect(pairs.map((plan) => plan.freeTransfersAfterPlan)).toEqual([0, 0, 0]);
  });
  it("rolls once before the delayed move, respects the cap, and excludes first-week gain", () => {
    const { settings, run, add } = setup();
    add(player(100, 4, 6), [100, 10]);
    settings.freeTransfers = 0;
    const fromZero = run().find((plan) => plan.kind === "roll-then-transfer")!;
    expect(fromZero.actions[0].week).toBe(3);
    expect(fromZero.gain).toBe(18);
    expect(fromZero.hit).toBe(0);
    expect(fromZero.freeTransfersAfterPlan).toBe(0);
    settings.freeTransfers = 5;
    const atCap = run().find((plan) => plan.kind === "roll-then-transfer")!;
    expect(atCap.freeTransfersAfterPlan).toBe(4);
  });
  it("keeps every resulting squad unique, in position, and within every club limit", () => {
    const { data, squad, run, add } = setup();
    add(player(100, 3, 1), [20, 20]);
    add(player(101, 2, 1), [15, 15]);
    const plans = run();
    expect(plans.length).toBeGreaterThan(0);
    for (const plan of plans) {
      const changed = squad.map((p) => {
        const action = plan.actions.find((a) => a.outId === p.id);
        const incoming = action
          ? data.bootstrap.elements.find(
              (candidate) => candidate.id === action.inId,
            )!
          : p;
        expect(incoming.element_type).toBe(p.element_type);
        return incoming;
      });
      expect(new Set(changed.map((p) => p.id)).size).toBe(15);
      expect(excessClubIds(changed, 3)).toEqual([]);
      expect(new Set(plan.actions.map((a) => a.outId)).size).toBe(
        plan.actions.length,
      );
    }
  });
  it("does not invent a deferred week or choose unavailable transaction candidates", () => {
    const { run, add } = setup();
    const star = player(100, 4, 6);
    star.can_transact = false;
    add(star, [20, 20]);
    expect(run()).toEqual([]);
    star.can_transact = true;
    expect(run([2]).every((plan) => plan.kind !== "roll-then-transfer")).toBe(
      true,
    );
    expect(run([])).toEqual([]);
  });
});

describe("availability sensitivity", () => {
  it("reports both gain scenarios against the corresponding keep baseline", () => {
    const { data, settings, squad, add } = setup();
    squad[7].status = "i";
    squad[7].expected_goals = 30;
    const star = player(100, 3, 6);
    star.expected_goals = 12;
    add(star, [0, 0]);
    data.bootstrap.events = [2, 3].map((id) => ({
      id,
      name: `GW${id}`,
      deadline_time: "2026-10-05T12:00:00Z",
      is_current: false,
      is_next: id === 2,
      finished: false,
    }));
    data.fixtures = Array.from({ length: 12 }, (_, match) =>
      Array.from({ length: 6 }, (_, team) => ({
        id: match * 6 + team,
        event: match < 10 ? 1 : match - 8,
        team_h: team + 1,
        team_a: 20,
        team_h_difficulty: 3,
        team_a_difficulty: 3,
        finished: match < 10,
        kickoff_time:
          match < 10 ? "2026-09-01T12:00:00Z" : "2026-10-05T12:00:00Z",
      })),
    ).flat();
    const result = analyze(data, settings);
    const move = result.moves.find((candidate) => candidate.outId === 8)!;
    expect(move).toBeDefined();
    expect(move.gainPersistent).toBe(move.gain);
    expect(move.gainRecovery).toBeLessThan(move.gainPersistent!);
    expect(move.risks.join(" ")).toContain("Availability-sensitive");
    settings.availabilityScenario = "recover-next-week";
    for (const recovered of analyze(data, settings).moves)
      expect(recovered.gainRecovery).toBe(recovered.gain);
  });
});
