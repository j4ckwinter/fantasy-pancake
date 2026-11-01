import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { createSnapshot, evaluateSnapshot } from "./evaluation";
import type { Data, History, Player, Settings } from "./schemas";
import type { Analysis } from "./model";

function context() {
  const elements: Player[] = [1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4].map(
    (position, index) => ({
      id: index + 1,
      web_name: `Player ${index + 1}`,
      team: Math.floor(index / 3) + 1,
      element_type: position,
      now_cost: 50,
      status: "a",
      news: "",
      can_select: true,
      can_transact: true,
      chance_of_playing_next_round: 100,
      minutes: 90,
      starts: 1,
      expected_goals: 0.2,
      expected_assists: 0.1,
      expected_goals_conceded: 1,
      defensive_contribution: 10,
      saves: 0,
      creativity: 0,
      penalties_order: null,
      corners_and_indirect_freekicks_order: null,
      direct_freekicks_order: null,
    }),
  );
  const data: Data = {
    fetchedAt: "2026-10-01T10:00:00Z",
    bootstrap: {
      elements,
      teams: Array.from({ length: 6 }, (_, index) => ({
        id: index + 1,
        name: `Club ${index + 1}`,
        short_name: `C${index + 1}`,
      })),
      events: [1, 2, 3].map((id) => ({
        id,
        name: `GW${id}`,
        deadline_time: `2026-10-${id === 1 ? "01" : id === 2 ? "08" : "15"}T12:00:00Z`,
        is_current: id === 1,
        is_next: id === 2,
        finished: id === 1,
      })),
      element_types: [1, 2, 3, 4].map((id) => ({
        id,
        singular_name_short: String(id),
        squad_select: [0, 2, 5, 5, 3][id],
        squad_min_play: [0, 1, 3, 2, 1][id],
        squad_max_play: [0, 1, 5, 5, 3][id],
      })),
      game_settings: {
        squad_squadsize: 15,
        squad_squadplay: 11,
        squad_team_limit: 3,
        max_extra_free_transfers: 4,
      },
    },
    fixtures: [1, 2].flatMap((event) =>
      [1, 3, 5].map((team) => ({
        id: event * 10 + team,
        event,
        team_h: team,
        team_a: team + 1,
        team_h_difficulty: 3,
        team_a_difficulty: 3,
        finished: event === 1,
        kickoff_time: `2026-10-${event === 1 ? "01" : "08"}T15:00:00Z`,
      })),
    ),
  };
  const settings: Settings = {
    version: 1,
    entryId: 1,
    season: "2026",
    sourceGameweek: 1,
    bank: 0,
    freeTransfers: 1,
    squad: elements.map((player) => ({ id: player.id, sellingPrice: 50 })),
  };
  const analysis: Analysis = {
    weeks: [2, 3],
    baseline: [],
    moves: [],
    threshold: 2,
    rollReason: "Keep",
  };
  const outcomes = {
    fixtures: data.fixtures.map((fixture) => ({ ...fixture, finished: true })),
    completedGameweeks: [2, 3],
    histories: Object.fromEntries(
      elements.map((player) => {
        const fixture = data.fixtures.find(
          (fixture) =>
            fixture.event === 2 &&
            (fixture.team_h === player.team || fixture.team_a === player.team),
        )!;
        const row: History[number] = {
          fixture: fixture.id,
          round: 2,
          minutes: 90,
          starts: 1,
          expected_goals: 0,
          expected_assists: 0,
          expected_goals_conceded: 0,
          defensive_contribution: 0,
          total_points: 2,
          kickoff_time: fixture.kickoff_time!,
        };
        return [String(player.id), [row]];
      }),
    ),
  };
  return { data, settings, analysis, outcomes };
}

describe("frozen deadline evaluation", () => {
  it("scores frozen starters and captain, counts blanks as zero and charges hits once", () => {
    const { data, settings, analysis, outcomes } = context();
    const snapshot = createSnapshot(
      data,
      settings,
      analysis,
      [],
      "2026-10-02T10:00:00Z",
    );
    snapshot.policies[0].hit = 4;
    const report = evaluateSnapshot(snapshot, outcomes);
    expect(report.policies[0]).toMatchObject({
      status: "complete",
      points: 20,
      hit: 4,
    });
  });
  it("does not replace frozen starters with a bench player who later hauls", () => {
    const { data, settings, analysis, outcomes } = context();
    const snapshot = createSnapshot(
      data,
      settings,
      analysis,
      [],
      "2026-10-02T10:00:00Z",
    );
    const bench = settings.squad.find(
      (pick) => !snapshot.policies[0].lineups[0].ids.includes(pick.id),
    )!;
    outcomes.histories[String(bench.id)][0].total_points = 100;
    expect(evaluateSnapshot(snapshot, outcomes).policies[0].points).toBe(24);
  });
  it("requires final fixture status and exactly one outcome for each scheduled starter", () => {
    const { data, settings, analysis, outcomes } = context();
    const snapshot = createSnapshot(
      data,
      settings,
      analysis,
      [],
      "2026-10-02T10:00:00Z",
    );
    const id = String(snapshot.policies[0].lineups[0].ids[0]);
    outcomes.histories[id] = [];
    expect(evaluateSnapshot(snapshot, outcomes).policies[0]).toMatchObject({
      status: "incomplete",
      points: null,
      gainOverRoll: null,
    });
    outcomes.completedGameweeks = [];
    expect(
      evaluateSnapshot(snapshot, outcomes).policies.every(
        (policy) => policy.status === "incomplete",
      ),
    ).toBe(true);
  });
  it("rejects late capture, future fetch timestamps and leaked target histories", () => {
    const { data, settings, analysis, outcomes } = context();
    expect(() =>
      createSnapshot(data, settings, analysis, [], "2026-10-08T12:00:00Z"),
    ).toThrow("before the first target deadline");
    expect(() =>
      createSnapshot(
        { ...data, fetchedAt: "2026-10-03T00:00:00Z" },
        settings,
        analysis,
        [],
        "2026-10-02T10:00:00Z",
      ),
    ).toThrow("after capture");
    expect(() =>
      createSnapshot(
        { ...data, histories: outcomes.histories },
        settings,
        analysis,
        [],
        "2026-10-02T10:00:00Z",
      ),
    ).toThrow("future or target-gameweek");
  });
  it("preserves the inputs by value and marks unconfirmed sale policies", () => {
    const { data, settings, analysis } = context();
    data.bootstrap.elements.push({
      ...data.bootstrap.elements[2],
      id: 16,
      team: 6,
    });
    analysis.moves = [
      {
        outId: 3,
        inId: 16,
        cost: 50,
        remainingBank: 0,
        hit: 0,
        gain: 3,
        immediateGain: 1,
        grossGain: 3,
        reasons: [],
        risks: [],
        fixtures: [],
      },
    ];
    const snapshot = createSnapshot(
      data,
      settings,
      analysis,
      [],
      "2026-10-02T10:00:00Z",
    );
    expect(
      snapshot.policies.find((policy) => policy.id === "single-1")
        ?.sellingPricesConfirmed,
    ).toBe(false);
    settings.bank = 10;
    expect(snapshot.settings.bank).toBe(0);
    expect(
      snapshot.policies
        .find((policy) => policy.id === "single-1")
        ?.lineups.every((lineup) => !lineup.ids.includes(3)),
    ).toBe(true);
  });
});

it("evaluates exported files through the standalone CLI", () => {
  const { data, settings, analysis, outcomes } = context();
  const snapshot = createSnapshot(
    data,
    settings,
    analysis,
    [],
    "2026-10-02T10:00:00Z",
  );
  const directory = mkdtempSync(join(tmpdir(), "fpl-evaluation-"));
  try {
    const snapshotPath = join(directory, "snapshot.json"),
      outcomesPath = join(directory, "outcomes.json");
    writeFileSync(snapshotPath, JSON.stringify(snapshot));
    writeFileSync(outcomesPath, JSON.stringify(outcomes));
    const processResult = spawnSync(
      process.execPath,
      ["scripts/evaluate-snapshot.ts", snapshotPath, outcomesPath],
      { encoding: "utf8" },
    );
    expect(processResult.stderr).toBe("");
    expect(processResult.status).toBe(0);
    expect(JSON.parse(processResult.stdout).policies[0]).toMatchObject({
      status: "complete",
      points: 24,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("uses the realized schedule when a fixture moves into a formerly blank week", () => {
  const { data, settings, analysis, outcomes } = context();
  const snapshot = createSnapshot(
    data,
    settings,
    analysis,
    [],
    "2026-10-02T10:00:00Z",
  );
  outcomes.fixtures = outcomes.fixtures.map((fixture) =>
    fixture.event === 2 ? { ...fixture, event: 3 } : fixture,
  );
  for (const rows of Object.values(outcomes.histories)) rows[0].round = 3;
  const report = evaluateSnapshot(snapshot, outcomes);
  expect(report.policies[0]).toMatchObject({ status: "complete", points: 24 });
});

it("does not count an unfinished or unconfirmed blank gameweek as complete", () => {
  const { data, settings, analysis, outcomes } = context();
  const snapshot = createSnapshot(
    data,
    settings,
    analysis,
    [],
    "2026-10-02T10:00:00Z",
  );
  outcomes.completedGameweeks = [2];
  expect(evaluateSnapshot(snapshot, outcomes).policies[0]).toMatchObject({
    status: "incomplete",
    points: null,
  });
  outcomes.completedGameweeks = [2, 3];
  outcomes.fixtures = outcomes.fixtures.map((fixture) => ({
    ...fixture,
    finished: false,
  }));
  expect(evaluateSnapshot(snapshot, outcomes).policies[0].status).toBe(
    "incomplete",
  );
});

it("rejects empty and truncated outcome schedules even when gameweeks are declared complete", () => {
  const { data, settings, analysis, outcomes } = context();
  const snapshot = createSnapshot(
    data,
    settings,
    analysis,
    [],
    "2026-10-02T10:00:00Z",
  );
  expect(() =>
    evaluateSnapshot(snapshot, { ...outcomes, fixtures: [] }),
  ).toThrow("Outcome schedule is incomplete: missing fixture IDs");
  expect(() =>
    evaluateSnapshot(snapshot, {
      ...outcomes,
      fixtures: outcomes.fixtures.slice(1),
    }),
  ).toThrow("Supply the full later fixtures response");
});

it("scores a completed blank when every original fixture remains in the actual schedule", () => {
  const { data, settings, analysis, outcomes } = context();
  const snapshot = createSnapshot(
    data,
    settings,
    analysis,
    [],
    "2026-10-02T10:00:00Z",
  );
  const report = evaluateSnapshot(snapshot, {
    ...outcomes,
    fixtures: outcomes.fixtures.map((fixture) =>
      fixture.event === 2
        ? { ...fixture, event: null, finished: false }
        : fixture,
    ),
    histories: {},
  });
  expect(report.policies[0]).toMatchObject({ status: "complete", points: 0 });
});
