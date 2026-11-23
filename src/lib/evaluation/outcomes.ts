import { z } from "zod";
import { STARTING_XI_SIZE } from "../schemas";
import { playsIn } from "../model/schedule";
import {
  ROLL_POLICY_ID,
  outcomesSchema,
  snapshotSchema,
  type EvaluationSnapshot,
  type FrozenLineup,
  type FrozenPolicy,
} from "./snapshot-schema";
import { assertPreDeadline } from "./capture-checks";

const CAPTAIN_MULTIPLIER = 2;

type Outcomes = z.infer<typeof outcomesSchema>;
type Tally = { total: number; missing: string[] };

function assertCompleteSchedule(
  snapshot: EvaluationSnapshot,
  outcomes: Outcomes,
): void {
  const actualFixtureIds = new Set(
    outcomes.fixtures.map((fixture) => fixture.id),
  );
  if (actualFixtureIds.size !== outcomes.fixtures.length) {
    throw new Error("Outcome schedule contains duplicate fixture IDs.");
  }
  const missingFixtureIds = snapshot.data.fixtures
    .filter((fixture) => !actualFixtureIds.has(fixture.id))
    .map((fixture) => fixture.id);
  if (missingFixtureIds.length) {
    throw new Error(
      `Outcome schedule is incomplete: missing fixture IDs ${missingFixtureIds.join(", ")}. Supply the full later fixtures response, retaining postponed fixtures with their updated event or null.`,
    );
  }
}

function tallyLineup(
  snapshot: EvaluationSnapshot,
  outcomes: Outcomes,
  lineup: FrozenLineup,
  tally: Tally,
): void {
  if (
    new Set(lineup.ids).size !== STARTING_XI_SIZE ||
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
        fixture.event === lineup.week && playsIn(fixture, player.team),
    );
    for (const fixture of fixtures) {
      const rows = (outcomes.histories[String(id)] ?? []).filter(
        (row) => row.fixture === fixture.id && row.round === lineup.week,
      );
      if (!fixture.finished || rows.length !== 1) {
        tally.missing.push(
          `GW${lineup.week}: player ${id}, fixture ${fixture.id}${rows.length > 1 ? " (duplicate outcomes)" : ""}`,
        );
        continue;
      }
      tally.total +=
        rows[0].total_points * (id === lineup.captain ? CAPTAIN_MULTIPLIER : 1);
    }
  }
}

function scorePolicy(
  snapshot: EvaluationSnapshot,
  outcomes: Outcomes,
  weeks: number[],
  policy: FrozenPolicy,
) {
  const completedGameweeks = new Set(outcomes.completedGameweeks);
  const tally: Tally = { total: 0 - policy.hit, missing: [] };
  if (
    policy.lineups.length !== weeks.length ||
    policy.lineups.some((lineup, index) => lineup.week !== weeks[index])
  )
    throw new Error("Frozen policy does not cover the snapshot horizon.");
  for (const lineup of policy.lineups) {
    if (!completedGameweeks.has(lineup.week)) {
      tally.missing.push(`GW${lineup.week}: gameweek is not complete`);
      continue;
    }
    tallyLineup(snapshot, outcomes, lineup, tally);
  }
  const { missing, total } = tally;
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
}

export function evaluateSnapshot(
  snapshotInput: unknown,
  outcomesInput: unknown,
) {
  const snapshot = snapshotSchema.parse(snapshotInput);
  const outcomes = outcomesSchema.parse(outcomesInput);
  const weeks = assertPreDeadline(snapshot.data, snapshot.capturedAt);
  assertCompleteSchedule(snapshot, outcomes);
  const policies = snapshot.policies.map((policy) =>
    scorePolicy(snapshot, outcomes, weeks, policy),
  );
  const roll = policies.find((policy) => policy.id === ROLL_POLICY_ID)?.points;
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
