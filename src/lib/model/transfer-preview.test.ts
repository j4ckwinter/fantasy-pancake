import { describe, expect, it } from "vitest";
import { analyze, evaluateTransfer, previewTransfers } from "../model";
import {
  settingsSchema,
  type Data,
  type Player,
  type Settings,
} from "../schemas";

function player(
  id: number,
  position: number,
  team: number,
  overrides: Partial<Player> = {},
): Player {
  return {
    id,
    web_name: `Player ${id}`,
    team,
    element_type: position,
    now_cost: 50,
    status: "a",
    news: "",
    can_select: true,
    can_transact: true,
    chance_of_playing_next_round: 100,
    minutes: 900,
    starts: 10,
    expected_goals: 1,
    expected_assists: 1,
    expected_goals_conceded: 12,
    defensive_contribution: 50,
    saves: 20,
    creativity: 100,
    penalties_order: null,
    corners_and_indirect_freekicks_order: null,
    direct_freekicks_order: null,
    ...overrides,
  };
}

function context() {
  const shape = [1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4];
  const elements = shape.map((position, index) =>
    player(index + 1, position, Math.floor(index / 3) + 1),
  );
  const fixtures = Array.from({ length: 14 }, (_, index) =>
    Array.from({ length: 6 }, (_, team) => ({
      id: index * 6 + team + 1,
      event: index + 1,
      team_h: team + 1,
      team_a: 20,
      team_h_difficulty: 3,
      team_a_difficulty: 3,
      finished: index < 10,
      kickoff_time: "2026-10-01T12:00:00Z",
    })),
  ).flat();
  const data: Data = {
    fetchedAt: "2026-10-01T12:00:00Z",
    fixtures,
    bootstrap: {
      elements,
      teams: Array.from({ length: 20 }, (_, i) => ({
        id: i + 1,
        name: `Club ${i + 1}`,
        short_name: `C${i + 1}`,
      })),
      events: Array.from({ length: 14 }, (_, i) => ({
        id: i + 1,
        name: `Gameweek ${i + 1}`,
        deadline_time: "2026-10-01T12:00:00Z",
        is_current: i === 9,
        is_next: i === 10,
        finished: i < 10,
      })),
      element_types: [
        {
          id: 1,
          singular_name_short: "GKP",
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
    entryId: 1,
    sourceGameweek: 10,
    season: "2026",
    bank: 0,
    freeTransfers: 1,
    squad: elements.map((p) => ({ id: p.id, sellingPrice: p.now_cost })),
  };
  return { data, settings };
}

function addStar(data: Data, overrides: Partial<Player> = {}) {
  const star = player(100, 3, 6, {
    expected_goals: 12,
    expected_assists: 8,
    ...overrides,
  });
  data.bootstrap.elements.push(star);
  return star;
}

describe("interactive transfers", () => {
  it("preserves old settings and validates unique positive locks", () => {
    const { settings } = context();
    expect(settingsSchema.parse(settings).lockedPlayerIds).toBeUndefined();
    expect(
      settingsSchema.safeParse({ ...settings, lockedPlayerIds: [8, 9] })
        .success,
    ).toBe(true);
    for (const lockedPlayerIds of [[8, 8], [0], [-1], [1.5]])
      expect(
        settingsSchema.safeParse({ ...settings, lockedPlayerIds }).success,
      ).toBe(false);
  });
  it("groups three incoming players with up to three outgoing alternatives each", () => {
    const { data, settings } = context();
    for (const id of [100, 101, 102, 103]) addStar(data, { id });
    const result = analyze(data, settings);
    expect([...new Set(result.moves.map((move) => move.inId))]).toEqual([
      100, 101, 102,
    ]);
    expect(result.moves).toHaveLength(9);
    for (const id of [100, 101, 102])
      expect(result.moves.filter((move) => move.inId === id)).toHaveLength(3);
    for (const move of result.moves)
      expect(
        evaluateTransfer(data, settings, move.outId, move.inId).move,
      ).toEqual(move);
  });
  it("honors locks in singles, pair plans, delayed plans and custom transfers", () => {
    const { data, settings } = context();
    addStar(data);
    addStar(data, { id: 101, element_type: 4 });
    settings.lockedPlayerIds = [8, 9, 10, 11, 13, 14];
    const result = analyze(data, settings);
    expect(result.moves.length).toBeGreaterThan(0);
    expect(result.plans?.map((plan) => plan.kind).sort()).toEqual([
      "pair-now",
      "roll-then-transfer",
    ]);
    for (const move of result.moves)
      expect(settings.lockedPlayerIds).not.toContain(move.outId);
    for (const plan of result.plans!)
      for (const action of plan.actions)
        expect(settings.lockedPlayerIds).not.toContain(action.outId);
    expect(() => evaluateTransfer(data, settings, 8, 100)).toThrow("locked");
    expect(() =>
      previewTransfers(data, settings, [{ week: 12, outId: 8, inId: 100 }]),
    ).toThrow("locked");
    settings.lockedPlayerIds = settings.squad.map((pick) => pick.id);
    expect(analyze(data, settings).moves).toEqual([]);
    expect(analyze(data, settings).plans).toEqual([]);
  });
  it("returns below-threshold custom moves and keeps bench players out of the XI", () => {
    const { data, settings } = context();
    addStar(data, {
      minutes: 0,
      starts: 0,
      expected_goals: 0,
      expected_assists: 0,
    });
    settings.freeTransfers = 0;
    const before = structuredClone(settings);
    const { move, lineups } = evaluateTransfer(data, settings, 8, 100);
    expect(move.gain).toBeLessThan(0);
    expect(move.hit).toBe(4);
    expect(lineups).toHaveLength(4);
    for (const lineup of lineups) {
      expect(lineup.ids).toHaveLength(11);
      expect(lineup.ids).not.toContain(100);
      expect(lineup.ids).not.toContain(8);
      expect(lineup.ids).toContain(lineup.captain);
    }
    expect(settings).toEqual(before);
  });
  it("rejects illegal custom moves with actionable reasons", () => {
    const { data, settings } = context();
    const star = addStar(data);
    expect(() => evaluateTransfer(data, settings, 1, 100)).toThrow(
      "same position",
    );
    expect(() => evaluateTransfer(data, settings, 8, 9)).toThrow("already");
    expect(() => evaluateTransfer(data, settings, 100, 8)).toThrow("belong");
    expect(() => evaluateTransfer(data, settings, 8, 999)).toThrow(
      "valid incoming",
    );
    star.now_cost = 51;
    expect(() => evaluateTransfer(data, settings, 8, 100)).toThrow(
      "unaffordable",
    );
    star.now_cost = 50;
    star.team = 1;
    expect(() => evaluateTransfer(data, settings, 8, 100)).toThrow("club");
    star.team = 6;
    star.can_transact = false;
    expect(() => evaluateTransfer(data, settings, 8, 100)).toThrow(
      "not available",
    );
  });
  it("applies deferred moves only from their scheduled gameweek", () => {
    const { data, settings } = context();
    addStar(data);
    const baseline = previewTransfers(data, settings, []);
    const after = evaluateTransfer(data, settings, 8, 100).lineups;
    const deferred = previewTransfers(data, settings, [
      { week: 12, outId: 8, inId: 100 },
    ]);
    expect(deferred[0]).toEqual(baseline[0]);
    expect(deferred.slice(1)).toEqual(after.slice(1));
    expect(deferred[1].ids).toContain(100);
    expect(deferred[1].captain).toBe(100);
    expect(() =>
      previewTransfers(data, settings, [{ week: 15, outId: 8, inId: 100 }]),
    ).toThrow("horizon");
  });
  it("funds simultaneous moves together and validates later ownership", () => {
    const { data, settings } = context();
    addStar(data, { now_cost: 70 });
    addStar(data, { id: 101, element_type: 2, now_cost: 30 });
    const actions = [
      { week: 11, outId: 8, inId: 100 },
      { week: 11, outId: 3, inId: 101 },
    ];
    expect(previewTransfers(data, settings, actions)).toHaveLength(4);
    expect(previewTransfers(data, settings, [...actions].reverse())).toEqual(
      previewTransfers(data, settings, actions),
    );
    expect(() =>
      previewTransfers(data, settings, [
        ...actions,
        { week: 12, outId: 8, inId: 9 },
      ]),
    ).toThrow("belong");
    expect(() =>
      previewTransfers(data, settings, [
        actions[0],
        { ...actions[1], week: 12 },
      ]),
    ).toThrow("unaffordable");
    expect(() =>
      previewTransfers(data, settings, [actions[1], actions[1]]),
    ).toThrow("only once");
  });
});
