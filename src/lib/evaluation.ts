import { z } from "zod";
import {
  dataSchema,
  fixtureSchema,
  historySchema,
  settingsSchema,
  type Data,
  type Player,
  type Settings,
} from "./schemas";
import { bestLineup, scorePlayer, upcomingWeeks, type Analysis } from "./model";

export const MODEL_VERSION = "forecast-v5";
const actionSchema = z.object({
  week: z.number().int(),
  outId: z.number().int(),
  inId: z.number().int(),
});
const frozenLineupSchema = z.object({
  week: z.number().int(),
  ids: z.array(z.number().int()).length(11),
  captain: z.number().int(),
});
const policySchema = z.object({
  id: z.string(),
  label: z.string(),
  hit: z.number().int().nonnegative(),
  actions: z.array(actionSchema),
  sellingPricesConfirmed: z.boolean(),
  lineups: z.array(frozenLineupSchema),
  historyCoverage: z.number().min(0).max(1).nullable(),
});
export const snapshotSchema = z.object({
  version: z.literal(1),
  modelVersion: z.string(),
  capturedAt: z.iso.datetime(),
  data: dataSchema,
  settings: settingsSchema,
  confirmedSellingPriceIds: z.array(z.number().int().positive()),
  policies: z.array(policySchema).min(1),
});
export type EvaluationSnapshot = z.infer<typeof snapshotSchema>;
const outcomesSchema = z.object({
  histories: z.record(z.string(), historySchema.shape.history),
  fixtures: z.array(fixtureSchema),
  completedGameweeks: z.array(z.number().int()),
});

type Action = z.infer<typeof actionSchema>;
function assertPreDeadline(data: Data, capturedAt: string) {
  const capture = Date.parse(capturedAt);
  const fetched = Date.parse(data.fetchedAt);
  const weeks = upcomingWeeks(data);
  const deadline = data.bootstrap.events.find(
    (event) => event.id === weeks[0],
  )?.deadline_time;
  if (
    !deadline ||
    !Number.isFinite(Date.parse(deadline)) ||
    capture >= Date.parse(deadline)
  ) {
    throw new Error("Capture a snapshot before the first target deadline.");
  }
  if (!Number.isFinite(fetched) || fetched > capture)
    throw new Error("Snapshot data cannot be fetched after capture.");
  for (const rows of Object.values(data.histories ?? {})) {
    for (const row of rows) {
      if (
        !Number.isFinite(Date.parse(row.kickoff_time)) ||
        Date.parse(row.kickoff_time) >= capture ||
        row.round >= weeks[0]
      ) {
        throw new Error(
          "Snapshot history contains future or target-gameweek outcomes.",
        );
      }
    }
  }
  return weeks;
}

function freezeLineups(
  data: Data,
  settings: Settings,
  weeks: number[],
  actions: Action[],
  scores: Map<number, number>[],
) {
  let squad = settings.squad.map((pick) => {
    const player = data.bootstrap.elements.find(
      (candidate) => candidate.id === pick.id,
    );
    if (!player) throw new Error(`Unknown squad player ${pick.id}.`);
    return player;
  });
  return weeks.map((week, index) => {
    for (const action of actions.filter((action) => action.week === week)) {
      const incoming = data.bootstrap.elements.find(
        (player) => player.id === action.inId,
      );
      if (!incoming || !squad.some((player) => player.id === action.outId))
        throw new Error("Invalid frozen transfer action.");
      squad = squad.map((player) =>
        player.id === action.outId ? incoming : player,
      );
    }
    const lineup = bestLineup(data, squad, scores[index]);
    if (lineup.captain === null)
      throw new Error("A frozen lineup requires a captain.");
    return { week, ids: lineup.ids, captain: lineup.captain };
  });
}

export function createSnapshot(
  data: Data,
  settings: Settings,
  analysis: Analysis,
  confirmedSellingPriceIds: number[],
  capturedAt = new Date().toISOString(),
): EvaluationSnapshot {
  z.iso.datetime().parse(capturedAt);
  data = dataSchema.parse(data);
  settings = settingsSchema.parse(settings);
  const weeks = assertPreDeadline(data, capturedAt);
  if (weeks.join(",") !== analysis.weeks.join(","))
    throw new Error("Analysis does not match the snapshot horizon.");
  const modelScores = weeks.map(
    (week) =>
      new Map(
        data.bootstrap.elements.map((player) => [
          player.id,
          scorePlayer(data, player, week, settings.availabilityScenario),
        ]),
      ),
  );
  const policy = (
    id: string,
    label: string,
    actions: Action[],
    hit: number,
    scores = modelScores,
  ) => ({
    id,
    label,
    actions,
    hit,
    historyCoverage:
      id === "lagged-points-hold"
        ? settings.squad.filter(
            (pick) => (data.histories?.[String(pick.id)]?.length ?? 0) > 0,
          ).length / settings.squad.length
        : null,
    sellingPricesConfirmed: actions.every((action) =>
      confirmedSellingPriceIds.includes(action.outId),
    ),
    lineups: freezeLineups(data, settings, weeks, actions, scores),
  });
  const policies = [policy("roll", "Keep squad · model XI", [], 0)];
  analysis.moves.forEach((move, index) =>
    policies.push(
      policy(
        `single-${index + 1}`,
        `Single transfer ${move.outId} → ${move.inId}`,
        [{ week: weeks[0], outId: move.outId, inId: move.inId }],
        move.hit,
      ),
    ),
  );
  const plans = z
    .array(
      z.object({
        kind: z.string(),
        actions: z.array(actionSchema),
        hit: z.number().int().nonnegative(),
      }),
    )
    .optional()
    .parse((analysis as Analysis & { plans?: unknown }).plans);
  plans?.forEach((plan, index) =>
    policies.push(
      policy(`plan-${index + 1}`, plan.kind, plan.actions, plan.hit),
    ),
  );
  const simpleScores = (forecast: (player: Player, week: number) => number) =>
    weeks.map(
      (week) =>
        new Map(
          data.bootstrap.elements.map((player) => [
            player.id,
            forecast(player, week),
          ]),
        ),
    );
  const fixtures = (player: Player, week: number) =>
    data.fixtures.filter(
      (fixture) =>
        fixture.event === week &&
        !fixture.finished &&
        (fixture.team_h === player.team || fixture.team_a === player.team),
    );
  policies.push(
    policy(
      "minutes-fixtures-hold",
      "Keep squad · season minutes and fixtures XI",
      [],
      0,
      simpleScores((player, week) => {
        const completed = data.fixtures.filter(
          (fixture) =>
            fixture.finished &&
            (fixture.team_h === player.team || fixture.team_a === player.team),
        ).length;
        const minutes = Math.min(90, player.minutes / Math.max(1, completed));
        return fixtures(player, week).reduce(
          (sum, fixture) =>
            sum +
            (minutes / 90) *
              (6 -
                (fixture.team_h === player.team
                  ? fixture.team_h_difficulty
                  : fixture.team_a_difficulty)),
          0,
        );
      }),
    ),
  );
  policies.push(
    policy(
      "lagged-points-hold",
      "Keep squad · previous six matches points XI",
      [],
      0,
      simpleScores((player, week) => {
        const rows = [...(data.histories?.[String(player.id)] ?? [])]
          .sort(
            (a, b) => Date.parse(b.kickoff_time) - Date.parse(a.kickoff_time),
          )
          .slice(0, 6);
        return rows.length
          ? (rows.reduce((sum, row) => sum + row.total_points, 0) /
              rows.length) *
              fixtures(player, week).length
          : 0;
      }),
    ),
  );
  return snapshotSchema.parse({
    version: 1,
    modelVersion: MODEL_VERSION,
    capturedAt,
    data,
    settings,
    confirmedSellingPriceIds,
    policies,
  });
}

export function evaluateSnapshot(
  snapshotInput: unknown,
  outcomesInput: unknown,
) {
  const snapshot = snapshotSchema.parse(snapshotInput);
  const outcomes = outcomesSchema.parse(outcomesInput);
  const weeks = assertPreDeadline(snapshot.data, snapshot.capturedAt);
  const completedGameweeks = new Set(outcomes.completedGameweeks);
  if (
    new Set(outcomes.fixtures.map((fixture) => fixture.id)).size !==
    outcomes.fixtures.length
  ) {
    throw new Error("Outcome schedule contains duplicate fixture IDs.");
  }
  const actualFixtureIds = new Set(
    outcomes.fixtures.map((fixture) => fixture.id),
  );
  const missingFixtureIds = snapshot.data.fixtures
    .filter((fixture) => !actualFixtureIds.has(fixture.id))
    .map((fixture) => fixture.id);
  if (missingFixtureIds.length) {
    throw new Error(
      `Outcome schedule is incomplete: missing fixture IDs ${missingFixtureIds.join(", ")}. Supply the full later fixtures response, retaining postponed fixtures with their updated event or null.`,
    );
  }
  const policies = snapshot.policies.map((policy) => {
    const missing: string[] = [];
    let total = 0 - policy.hit;
    if (
      policy.lineups.length !== weeks.length ||
      policy.lineups.some((lineup, index) => lineup.week !== weeks[index])
    )
      throw new Error("Frozen policy does not cover the snapshot horizon.");
    for (const lineup of policy.lineups) {
      if (!completedGameweeks.has(lineup.week)) {
        missing.push(`GW${lineup.week}: gameweek is not complete`);
        continue;
      }
      if (
        new Set(lineup.ids).size !== 11 ||
        !lineup.ids.includes(lineup.captain)
      )
        throw new Error("Invalid frozen lineup or captain.");
      for (const id of lineup.ids) {
        const player = snapshot.data.bootstrap.elements.find(
          (player) => player.id === id,
        );
        if (!player) throw new Error(`Unknown frozen player ${id}.`);
        const fixtures = outcomes.fixtures.filter(
          (fixture) =>
            fixture.event === lineup.week &&
            (fixture.team_h === player.team || fixture.team_a === player.team),
        );
        for (const fixture of fixtures) {
          const rows = (outcomes.histories[String(id)] ?? []).filter(
            (row) => row.fixture === fixture.id && row.round === lineup.week,
          );
          if (!fixture.finished || rows.length !== 1) {
            missing.push(
              `GW${lineup.week}: player ${id}, fixture ${fixture.id}${rows.length > 1 ? " (duplicate outcomes)" : ""}`,
            );
            continue;
          }
          total += rows[0].total_points * (id === lineup.captain ? 2 : 1);
        }
      }
    }
    return {
      id: policy.id,
      label: policy.label,
      status: missing.length ? ("incomplete" as const) : ("complete" as const),
      points: missing.length ? null : total,
      hit: policy.hit,
      sellingPricesConfirmed: policy.sellingPricesConfirmed,
      historyCoverage: policy.historyCoverage,
      missing,
    };
  });
  const roll = policies.find((policy) => policy.id === "roll")?.points;
  return {
    modelVersion: snapshot.modelVersion,
    capturedAt: snapshot.capturedAt,
    policies: policies.map((policy) => ({
      ...policy,
      gainOverRoll:
        policy.points !== null && roll !== null && roll !== undefined
          ? policy.points - roll
          : null,
    })),
  };
}
