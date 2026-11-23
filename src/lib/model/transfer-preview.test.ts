import { describe, expect, it } from "vitest";
import { analyze, evaluateTransfer, previewTransfers } from "../model";
import { addPlayer, seasonContext } from "./test-fixtures";

describe("interactive transfers", () => {
  it("groups three incoming players with up to three outgoing alternatives each", () => {
    const { data, settings } = seasonContext();
    for (const id of [100, 101, 102, 103]) addPlayer(data, { id });
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
    const { data, settings } = seasonContext();
    addPlayer(data);
    addPlayer(data, { id: 101, element_type: 4 });
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
    const { data, settings } = seasonContext();
    addPlayer(data, {
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
    const { data, settings } = seasonContext();
    const star = addPlayer(data);
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
    const { data, settings } = seasonContext();
    addPlayer(data);
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
    const { data, settings } = seasonContext();
    addPlayer(data, { now_cost: 70 });
    addPlayer(data, { id: 101, element_type: 2, now_cost: 30 });
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

describe("availability sensitivity", () => {
  it("reports both gain scenarios against the corresponding keep baseline", () => {
    const { data, settings } = seasonContext();
    Object.assign(data.bootstrap.elements[7], {
      status: "i",
      expected_goals: 30,
    });
    addPlayer(data);
    const move = analyze(data, settings).moves.find(
      (candidate) => candidate.outId === 8,
    )!;
    expect(move).toBeDefined();
    expect(move.gainPersistent).toBe(move.gain);
    expect(move.gainRecovery).toBeLessThan(move.gainPersistent!);
    expect(move.risks.join(" ")).toContain("Availability-sensitive");
    settings.availabilityScenario = "recover-next-week";
    for (const recovered of analyze(data, settings).moves)
      expect(recovered.gainRecovery).toBe(recovered.gain);
  });
});
