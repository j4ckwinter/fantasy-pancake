import { describe, expect, it } from "vitest";
import {
  analyze,
  bestLineup,
  scorePlayer,
  upcomingWeeks,
  validateSquad,
  overLimitClubs,
  evaluateTransfer,
} from "./model";
import { addPlayer, seasonContext } from "./model/test-fixtures";

describe("squad validation", () => {
  it("accepts legal squads and rejects duplicates and invalid composition", () => {
    const { data, settings } = seasonContext();
    expect(validateSquad(data, settings)).toEqual([]);
    settings.squad[7].id = settings.squad[0].id;
    expect(validateSquad(data, settings).join(" ")).toContain("only once");
    expect(validateSquad(data, settings).join(" ")).toContain("MID");
    expect(() => analyze(data, settings)).toThrow(
      "Each player can appear only once.",
    );
  });
  it("rejects impossible prices, invalid bank and missing players", () => {
    const { data, settings } = seasonContext();
    settings.squad[0].sellingPrice = 51;
    expect(validateSquad(data, settings).join(" ")).toContain("cannot exceed");
    settings.bank = -1;
    expect(validateSquad(data, settings)).toEqual([
      "Enter valid bank, selling prices and free transfers for all 15 players.",
    ]);
    settings.bank = 0;
    settings.squad[0].id = 999;
    expect(validateSquad(data, settings).join(" ")).toContain("no longer");
  });
});

describe("legal recommendations", () => {
  it("allows rolling with an exceptional fourth club player and only recommends corrective transfers", () => {
    const { data, settings } = seasonContext();
    data.bootstrap.elements[7].team = 1;
    expect(validateSquad(data, settings)).toEqual([]);
    expect(overLimitClubs(data, settings)).toEqual(["Club 1"]);
    expect(analyze(data, settings).moves).toEqual([]);
    addPlayer(data);
    const result = analyze(data, settings);
    expect(result.moves.length).toBeGreaterThan(0);
    expect(result.moves.every((move) => move.outId === 8)).toBe(true);
  });
  it("rejects all single transfers when five from one club leave residual excess", () => {
    const { data, settings } = seasonContext();
    data.bootstrap.elements[7].team = 1;
    data.bootstrap.elements[8].team = 1;
    addPlayer(data);
    expect(validateSquad(data, settings)).toEqual([]);
    expect(overLimitClubs(data, settings)).toEqual(["Club 1"]);
    expect(analyze(data, settings).moves).toEqual([]);
  });
  it("rejects a move that corrects one club but leaves another club over its limit", () => {
    const { data, settings } = seasonContext();
    data.bootstrap.elements[7].team = 1;
    data.bootstrap.elements[8].team = 2;
    addPlayer(data);
    expect(overLimitClubs(data, settings)).toEqual(["Club 1", "Club 2"]);
    expect(analyze(data, settings).moves).toEqual([]);
  });

  it("uses selling price plus bank with exact integer affordability", () => {
    const { data, settings } = seasonContext();
    addPlayer(data, { now_cost: 55 });
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
    const { data, settings } = seasonContext();
    addPlayer(data, { team: 3 });
    const moves = analyze(data, settings).moves;
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((move) => [8, 9].includes(move.outId))).toBe(true);
  });
  it("never buys an owned player, a different position, or a non-selectable player", () => {
    const { data, settings } = seasonContext();
    addPlayer(data, { can_select: false });
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
    const { data, settings } = seasonContext();
    addPlayer(data);
    const free = analyze(data, settings).moves[0];
    settings.freeTransfers = 0;
    const paid = analyze(data, settings).moves[0];
    expect(paid.hit).toBe(4);
    expect(paid.grossGain).toBe(free.grossGain);
    expect(paid.gain).toBeCloseTo(free.gain - 4, 2);
    expect(paid.immediateGain).toBeCloseTo(free.immediateGain - 4, 2);
  });
  it("rolls when a hit makes a modest gain unconvincing", () => {
    const { data, settings } = seasonContext();
    addPlayer(data, { expected_goals: 3, expected_assists: 1 });
    expect(analyze(data, settings).moves.length).toBeGreaterThan(0);
    settings.freeTransfers = 0;
    expect(analyze(data, settings).moves).toEqual([]);
  });
  it("keeps a minimum threshold at the free-transfer cap and explains the cap", () => {
    const { data, settings } = seasonContext();
    settings.freeTransfers = 5;
    const result = analyze(data, settings);
    expect(result.threshold).toBe(1);
    expect(result.rollReason).toContain("cannot add another");
  });
  it("words the roll-then-transfer reason by whether rolling can add a free transfer", () => {
    const { data, settings } = seasonContext();
    addPlayer(data);
    const rollReason = () =>
      analyze(data, settings).plans?.find(
        (plan) => plan.kind === "roll-then-transfer",
      )?.reasons[0];
    expect(rollReason()).toBe(
      "Keep your squad in GW11, accrue one free transfer up to the 5-transfer cap, then move in GW12.",
    );
    settings.freeTransfers = 5;
    expect(rollReason()).toBe(
      "Keep your squad in GW11, then move in GW12. You already hold the 5-transfer cap, so rolling does not add a free transfer.",
    );
  });
  it("is deterministic, does not mutate inputs, and keeps at most three outgoing alternatives for one incoming player", () => {
    const { data, settings } = seasonContext();
    addPlayer(data);
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
    const { data } = seasonContext();
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
    const { data, settings } = seasonContext();
    data.bootstrap.elements[0].expected_goals = 30;
    data.bootstrap.elements[1].expected_goals = 0;
    addPlayer(data, {
      element_type: 1,
      expected_goals: 2,
      expected_assists: 1,
    });
    expect(
      scorePlayer(data, data.bootstrap.elements.at(-1)!, 11),
    ).toBeGreaterThan(scorePlayer(data, data.bootstrap.elements[1], 11));
    expect(analyze(data, settings).moves).toEqual([]);
  });
});

describe("fixtures, minutes and uncertainty", () => {
  it("counts blanks as zero and double gameweeks twice without inventing fixtures", () => {
    const { data } = seasonContext();
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
    const { data } = seasonContext();
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
    const { data, settings } = seasonContext();
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

describe("squad validation messages", () => {
  it("rejects free transfers above the game's cap", () => {
    const { data, settings } = seasonContext();
    data.bootstrap.game_settings.max_extra_free_transfers = 1;
    settings.freeTransfers = 3;
    expect(validateSquad(data, settings)).toEqual([
      "Free transfers exceed the current game limit.",
    ]);
  });
  it("asks for the game's squad size when it differs from the saved squad", () => {
    const { data, settings } = seasonContext();
    data.bootstrap.game_settings.squad_squadsize = 16;
    expect(validateSquad(data, settings)).toEqual(["Select 16 players."]);
  });
});

describe("starting XI rules", () => {
  it("reports missing position rules", () => {
    const { data } = seasonContext();
    data.bootstrap.element_types = data.bootstrap.element_types.slice(0, 3);
    expect(() => bestLineup(data, data.bootstrap.elements, new Map())).toThrow(
      "Position rules are unavailable.",
    );
  });
  it("reports a squad that cannot field a legal XI", () => {
    const { data } = seasonContext();
    const twoDefenders = data.bootstrap.elements.filter(
      (p) => p.element_type !== 2 || p.id < 5,
    );
    expect(() => bestLineup(data, twoDefenders, new Map())).toThrow(
      "This squad cannot form a legal starting XI.",
    );
  });
  it("breaks equal scores by the lower player id", () => {
    const { data } = seasonContext();
    const lineup = bestLineup(
      data,
      data.bootstrap.elements,
      new Map(data.bootstrap.elements.map((p) => [p.id, 1])),
    );
    expect(lineup.captain).toBe(1);
    expect(lineup.ids).toContain(1);
    expect(lineup.ids).not.toContain(2);
  });
});

describe("planning horizon", () => {
  it("starts at the first unfinished gameweek before a season has a current one", () => {
    const { data } = seasonContext();
    data.bootstrap.events.forEach((event) => {
      event.is_next = false;
      event.is_current = false;
    });
    expect(upcomingWeeks(data)).toEqual([11, 12, 13, 14]);
  });
});

describe("roll explanation", () => {
  it("explains rolling against shown single transfers", () => {
    const { data, settings } = seasonContext();
    addPlayer(data);
    expect(analyze(data, settings).rollReason).toBe(
      "Rolling scores zero improvement and keeps flexibility. Only moves gaining more than 2 net expected points are shown.",
    );
  });
  it("points to larger plans when no single transfer qualifies", () => {
    const { data, settings } = seasonContext();
    addPlayer(data, { element_type: 4, now_cost: 70 });
    addPlayer(data, {
      id: 101,
      element_type: 2,
      now_cost: 30,
      expected_goals: 1,
      expected_assists: 1,
    });
    expect(analyze(data, settings).rollReason).toBe(
      "No legal single transfer beats the 2-point net gain threshold. Larger or delayed plans are shown separately; rolling remains the no-hit baseline.",
    );
  });
  it("recommends keeping the squad when nothing qualifies, noting the cap", () => {
    const { data, settings } = seasonContext();
    settings.freeTransfers = 5;
    expect(analyze(data, settings).rollReason).toBe(
      "No evaluated transfer plan beats the 1-point net gain threshold. Keep the squad and retain flexibility. You are at the free-transfer cap, so rolling cannot add another saved transfer.",
    );
  });
});

describe("incoming player risks", () => {
  it("lists sample, minutes, probability and availability risks", () => {
    const { data, settings } = seasonContext();
    addPlayer(data, {
      minutes: 300,
      starts: 3,
      status: "d",
      chance_of_playing_next_round: null,
      news: "Knock",
    });
    const risks = evaluateTransfer(data, settings, 8, 100).move.risks;
    expect(risks).toEqual(
      expect.arrayContaining([
        "Expected points are averages: in this season's backtest, forecasts for players who played were off by 1.9 points a gameweek on average.",
        "Recent match history is unavailable; season averages can miss recent changes in role.",
        "Small sample: fewer than 450 minutes; attacking rates are shrunk toward positional assumptions.",
        "Fewer than five season starts: the starting-role sample remains small.",
        "No explicit next-round playing probability is supplied by FPL.",
        "Availability flag: Knock.",
        "Current availability is held constant across the horizon; a short absence may be overstated.",
      ]),
    );
    expect(risks.join(" ")).toMatch(
      /Uncertain minutes: estimated \d+ per match, \d+% chance of reaching 60 minutes before availability adjustments\./,
    );
    settings.availabilityScenario = "recover-next-week";
    expect(evaluateTransfer(data, settings, 8, 100).move.risks).toContain(
      "Scenario assumes full availability from the second planning week; this is not a predicted recovery date.",
    );
  });
});
