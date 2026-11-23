import { z } from "zod";
import {
  dataSchema,
  settingsSchema,
  type Data,
  type Settings,
} from "../schemas";
import { bestLineup, type Analysis } from "../model";
import { weeklyScores } from "../model/scoring";
import {
  ROLL_POLICY_ID,
  actionSchema,
  snapshotSchema,
  type Action,
  type EvaluationSnapshot,
  type FrozenLineup,
  type FrozenPolicy,
} from "./snapshot-schema";
import { assertPreDeadline } from "./capture-checks";
import {
  laggedPointsScores,
  minutesAndFixturesScores,
  squadHistoryCoverage,
} from "./baseline-policies";

export const MODEL_VERSION = "forecast-v5";

type WeeklyScores = Map<number, number>[];

type PolicySpec = {
  id: string;
  label: string;
  actions: Action[];
  hit: number;
  scores: WeeklyScores;
  historyCoverage: number | null;
};

type Freezer = (spec: PolicySpec) => FrozenPolicy;

function freezeLineups(
  data: Data,
  settings: Settings,
  weeks: number[],
  actions: Action[],
  scores: WeeklyScores,
): FrozenLineup[] {
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
    return { week, ids: lineup.ids, captain: lineup.captain };
  });
}

function policyFreezer(
  data: Data,
  settings: Settings,
  weeks: number[],
  confirmedSellingPriceIds: number[],
): Freezer {
  return ({ id, label, actions, hit, scores, historyCoverage }) => ({
    id,
    label,
    actions,
    hit,
    historyCoverage,
    sellingPricesConfirmed: actions.every((action) =>
      confirmedSellingPriceIds.includes(action.outId),
    ),
    lineups: freezeLineups(data, settings, weeks, actions, scores),
  });
}

function analysisPolicies(
  analysis: Analysis,
  weeks: number[],
  scores: WeeklyScores,
): PolicySpec[] {
  const roll: PolicySpec = {
    id: ROLL_POLICY_ID,
    label: "Keep squad · model XI",
    actions: [],
    hit: 0,
    scores,
    historyCoverage: null,
  };
  const singles = analysis.moves.map((move, index): PolicySpec => ({
    id: `single-${index + 1}`,
    label: `Single transfer ${move.outId} → ${move.inId}`,
    actions: [{ week: weeks[0], outId: move.outId, inId: move.inId }],
    hit: move.hit,
    scores,
    historyCoverage: null,
  }));
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
  const planPolicies = (plans ?? []).map((plan, index): PolicySpec => ({
    id: `plan-${index + 1}`,
    label: plan.kind,
    actions: plan.actions,
    hit: plan.hit,
    scores,
    historyCoverage: null,
  }));
  return [roll, ...singles, ...planPolicies];
}

function simpleBaselinePolicies(
  data: Data,
  settings: Settings,
  weeks: number[],
): PolicySpec[] {
  return [
    {
      id: "minutes-fixtures-hold",
      label: "Keep squad · season minutes and fixtures XI",
      actions: [],
      hit: 0,
      scores: minutesAndFixturesScores(data, weeks),
      historyCoverage: null,
    },
    {
      id: "lagged-points-hold",
      label: "Keep squad · previous six matches points XI",
      actions: [],
      hit: 0,
      scores: laggedPointsScores(data, weeks),
      historyCoverage: squadHistoryCoverage(data, settings.squad),
    },
  ];
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
  const modelScores = weeklyScores(data, weeks, settings.availabilityScenario);
  const freeze = policyFreezer(data, settings, weeks, confirmedSellingPriceIds);
  return snapshotSchema.parse({
    version: 1,
    modelVersion: MODEL_VERSION,
    capturedAt,
    data,
    settings,
    confirmedSellingPriceIds,
    policies: [
      ...analysisPolicies(analysis, weeks, modelScores),
      ...simpleBaselinePolicies(data, settings, weeks),
    ].map(freeze),
  });
}
