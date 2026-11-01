import { describe, expect, it } from "vitest";
import {
  analyze,
  bestLineup,
  scorePlayer,
  upcomingWeeks,
  validateSquad,
  overLimitClubs,
} from "./model";
import type { Data, Player, Settings } from "./schemas";

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

describe("squad validation", () => {
  it("accepts legal squads and rejects duplicates and invalid composition", () => {
    const { data, settings } = context();
    expect(validateSquad(data, settings)).toEqual([]);
    settings.squad[7].id = settings.squad[0].id;
    expect(validateSquad(data, settings).join(" ")).toContain("only once");
    expect(validateSquad(data, settings).join(" ")).toContain("MID");
    expect(() => analyze(data, settings)).toThrow();
  });
  it("rejects impossible prices, invalid bank and missing players", () => {
    const { data, settings } = context();
    settings.squad[0].sellingPrice = 51;
    expect(validateSquad(data, settings).join(" ")).toContain("cannot exceed");
    settings.bank = -1;
    expect(validateSquad(data, settings)).not.toEqual([]);
    settings.bank = 0;
    settings.squad[0].id = 999;
    expect(validateSquad(data, settings).join(" ")).toContain("no longer");
  });
});

describe("legal recommendations", () => {
  it("allows rolling with an exceptional fourth club player and only recommends corrective transfers", () => {
    const { data, settings } = context();
    data.bootstrap.elements[7].team = 1;
    expect(validateSquad(data, settings)).toEqual([]);
    expect(overLimitClubs(data, settings)).toEqual(["Club 1"]);
    expect(analyze(data, settings).moves).toEqual([]);
    addStar(data);
    const result = analyze(data, settings);
    expect(result.moves.length).toBeGreaterThan(0);
    expect(result.moves.every((move) => move.outId === 8)).toBe(true);
  });
  it("rejects all single transfers when five from one club leave residual excess", () => {
    const { data, settings } = context();
    data.bootstrap.elements[7].team = 1;
    data.bootstrap.elements[8].team = 1;
    addStar(data);
    expect(validateSquad(data, settings)).toEqual([]);
    expect(overLimitClubs(data, settings)).toEqual(["Club 1"]);
    expect(analyze(data, settings).moves).toEqual([]);
  });
  it("rejects a move that corrects one club but leaves another club over its limit", () => {
    const { data, settings } = context();
    data.bootstrap.elements[7].team = 1;
    data.bootstrap.elements[8].team = 2;
    addStar(data);
    expect(overLimitClubs(data, settings)).toEqual(["Club 1", "Club 2"]);
    expect(analyze(data, settings).moves).toEqual([]);
  });

  it("uses selling price plus bank with exact integer affordability", () => {
    const { data, settings } = context();
    addStar(data, { now_cost: 55 });
    settings.bank = 5;
    const moves = analyze(data, settings).moves;
    expect(moves.length).toBeGreaterThan(0);
    expect(
      moves.every((move) => move.remainingBank === 0 && move.cost === 55),
    ).toBe(true);
    settings.bank = 4;
    expect(analyze(data, settings).moves).toEqual([]);
    settings.bank = 5;
    settings.squad
      .filter((pick) => [8, 9, 10, 11, 12].includes(pick.id))
      .forEach((pick) => {
        pick.sellingPrice = 49;
      });
    expect(analyze(data, settings).moves).toEqual([]);
  });
  it("allows replacing a same-club player at the club limit and rejects adding a fourth", () => {
    const { data, settings } = context();
    addStar(data, { team: 3 });
    const moves = analyze(data, settings).moves;
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((move) => [8, 9].includes(move.outId))).toBe(true);
  });
  it("never buys an owned player, a different position, or a non-selectable player", () => {
    const { data, settings } = context();
    addStar(data, { can_select: false });
    expect(analyze(data, settings).moves).toEqual([]);
    data.bootstrap.elements.at(-1)!.can_select = true;
    data.bootstrap.elements.at(-1)!.can_transact = false;
    expect(analyze(data, settings).moves).toEqual([]);
    data.bootstrap.elements.at(-1)!.can_transact = true;
    expect(
      analyze(data, settings).moves.every(
        (move) => [8, 9, 10, 11, 12].includes(move.outId) && move.inId === 100,
      ),
    ).toBe(true);
  });
  it("deducts one four-point hit from the horizon and immediate gameweek", () => {
    const { data, settings } = context();
    addStar(data);
    const free = analyze(data, settings).moves[0];
    settings.freeTransfers = 0;
    const paid = analyze(data, settings).moves[0];
    expect(paid.hit).toBe(4);
    expect(paid.grossGain).toBe(free.grossGain);
    expect(paid.gain).toBeCloseTo(free.gain - 4, 2);
    expect(paid.immediateGain).toBeCloseTo(free.immediateGain - 4, 2);
  });
  it("rolls when a hit makes a modest gain unconvincing", () => {
    const { data, settings } = context();
    addStar(data, { expected_goals: 3, expected_assists: 1 });
    expect(analyze(data, settings).moves.length).toBeGreaterThan(0);
    settings.freeTransfers = 0;
    expect(analyze(data, settings).moves).toEqual([]);
  });
  it("keeps a minimum threshold at the free-transfer cap and explains the cap", () => {
    const { data, settings } = context();
    settings.freeTransfers = 5;
    const result = analyze(data, settings);
    expect(result.threshold).toBe(1);
    expect(result.rollReason).toContain("cannot add another");
  });
  it("is deterministic, does not mutate inputs, and returns at most three worthwhile moves", () => {
    const { data, settings } = context();
    addStar(data);
    const before = JSON.stringify({ data, settings });
    const first = analyze(data, settings);
    expect(first).toEqual(analyze(data, settings));
    expect(JSON.stringify({ data, settings })).toBe(before);
    expect(first.moves).toHaveLength(3);
    expect(first.moves.every((move) => move.gain > first.threshold)).toBe(true);
  });
});

describe("starting XI and captaincy", () => {
  it("selects a legal formation and doubles the strongest starter", () => {
    const { data } = context();
    const scores = new Map(
      data.bootstrap.elements.map((p) => [p.id, p.element_type === 4 ? 10 : 1]),
    );
    const lineup = bestLineup(data, data.bootstrap.elements, scores);
    expect(lineup.ids).toHaveLength(11);
    const selected = data.bootstrap.elements.filter((p) =>
      lineup.ids.includes(p.id),
    );
    expect(selected.filter((p) => p.element_type === 1)).toHaveLength(1);
    expect(
      selected.filter((p) => p.element_type === 2).length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      selected.filter((p) => p.element_type === 3).length,
    ).toBeGreaterThanOrEqual(2);
    expect(selected.filter((p) => p.element_type === 4)).toHaveLength(3);
    expect(lineup.captain).toBe(13);
    expect(lineup.score).toBe(48);
  });
  it("does not reward a bench-only improvement", () => {
    const { data, settings } = context();
    data.bootstrap.elements[0].expected_goals = 30;
    data.bootstrap.elements[1].expected_goals = 0;
    addStar(data, { element_type: 1, expected_goals: 2, expected_assists: 1 });
    expect(
      scorePlayer(data, data.bootstrap.elements.at(-1)!, 11),
    ).toBeGreaterThan(scorePlayer(data, data.bootstrap.elements[1], 11));
    expect(analyze(data, settings).moves).toEqual([]);
  });
});

describe("fixtures, minutes and uncertainty", () => {
  it("counts blanks as zero and double gameweeks twice without inventing fixtures", () => {
    const { data } = context();
    const p = data.bootstrap.elements[0];
    const single = scorePlayer(data, p, 11);
    data.fixtures = data.fixtures.filter(
      (f) => !(f.event === 12 && f.team_h === p.team),
    );
    expect(scorePlayer(data, p, 12)).toBe(0);
    data.fixtures.push({
      ...data.fixtures.find((f) => f.event === 11 && f.team_h === p.team)!,
      id: 999,
    });
    expect(scorePlayer(data, p, 11)).toBeCloseTo(single * 2);
  });
  it("reduces scores for unavailable and low-minute players", () => {
    const { data } = context();
    const p = data.bootstrap.elements[0];
    expect(scorePlayer(data, { ...p, status: "i" }, 11)).toBe(0);
    expect(
      scorePlayer(data, { ...p, chance_of_playing_next_round: 50 }, 11),
    ).toBeCloseTo(scorePlayer(data, p, 11) / 2);
    expect(
      scorePlayer(
        data,
        { ...p, minutes: 0, starts: 0, expected_goals: 0, expected_assists: 0 },
        11,
      ),
    ).toBe(0);
  });
  it("uses four gameweeks, handles the final weeks and avoids replanning an active final week", () => {
    const { data, settings } = context();
    expect(upcomingWeeks(data)).toEqual([11, 12, 13, 14]);
    data.bootstrap.events.forEach((event) => {
      event.is_next = event.id === 14;
    });
    expect(upcomingWeeks(data)).toEqual([14]);
    data.bootstrap.events.forEach((event) => {
      event.is_next = false;
    });
    expect(analyze(data, settings).weeks).toEqual([]);
    expect(analyze(data, settings).rollReason).toContain("No upcoming");
  });
});
