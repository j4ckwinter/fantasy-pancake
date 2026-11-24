import type { ChipName, Player } from "../schemas";
import type { Lineup, TransferPlan } from "./types";
import { bestAffordableSquad, type SquadMarket } from "./affordable-squad";
import { bestLineup } from "./lineup";
import { isTransferable } from "./transfer-legality";
import { previewWeeks, type TransferContext } from "./transfer-preview";

export type PathWeek = {
  week: number;
  squad: Player[];
  lineup: Lineup;
  points: number;
};

export type ChipPlay = { chip: ChipName; week: number };

export type PathValue = { gain: number; weeks: PathWeek[] };

export type ChipPath = {
  weeks: number[];
  evaluate: (plays: readonly ChipPlay[]) => PathValue | null;
};

function cached<T>(compute: (index: number) => T): (index: number) => T {
  const values = new Map<number, T>();
  return (index) => {
    if (!values.has(index)) values.set(index, compute(index));
    return values.get(index)!;
  };
}

function rebuildMarket(context: TransferContext): SquadMarket {
  const { data, settings } = context;
  const selling = new Map(
    settings.squad.map((pick) => [pick.id, pick.sellingPrice]),
  );
  const prices = new Map(
    data.bootstrap.elements.flatMap((player): [number, number][] => {
      const owned = selling.get(player.id);
      if (owned !== undefined) return [[player.id, owned]];
      return isTransferable(player) ? [[player.id, player.now_cost]] : [];
    }),
  );
  const budget =
    settings.bank +
    settings.squad.reduce((sum, pick) => sum + pick.sellingPrice, 0);
  return { players: data.bootstrap.elements, prices, budget };
}

function basePath(context: TransferContext, plans: TransferPlan[]) {
  const plan = plans.find(
    (candidate) =>
      candidate.kind === "plan-ahead" && candidate.variant === "best",
  );
  return previewWeeks(context, plan?.actions ?? []).map(
    ({ squad, lineup }, index): PathWeek => ({
      week: context.weeks[index],
      squad,
      lineup,
      points: lineup.score - (plan?.weeks[index].hit ?? 0),
    }),
  );
}

function benchPoints(week: PathWeek, scores: ReadonlyMap<number, number>) {
  return week.squad
    .filter((player) => !week.lineup.ids.includes(player.id))
    .reduce((sum, player) => sum + (scores.get(player.id) ?? 0), 0);
}

export function chipPath(
  context: TransferContext,
  plans: TransferPlan[],
): ChipPath {
  const { data, weeks, scores } = context;
  const base = basePath(context, plans);
  const market = rebuildMarket(context);
  const keep = (squad: Player[], from: number, until: number) =>
    scores.slice(from, until).map((week, offset): PathWeek => {
      const lineup = bestLineup(data, squad, week);
      return {
        week: weeks[from + offset],
        squad,
        lineup,
        points: lineup.score,
      };
    });
  const freeHit = cached((index) => {
    const squad = bestAffordableSquad(data, market, [scores[index]]);
    return squad ? keep(squad, index, index + 1)[0] : null;
  });
  const wildcard = cached((index) => {
    const squad = bestAffordableSquad(data, market, scores.slice(index));
    return squad ? keep(squad, index, weeks.length) : null;
  });
  const baseTotal = base.reduce((sum, week) => sum + week.points, 0);

  function evaluate(plays: readonly ChipPlay[]): PathValue | null {
    const playIn = (index: number) =>
      plays.find((play) => play.week === weeks[index])?.chip;
    const path: PathWeek[] = [];
    let permanent: { from: number; weeks: PathWeek[] } | null = null;
    for (let index = 0; index < weeks.length; index++) {
      const chip = playIn(index);
      if (chip === "wildcard") {
        const rebuiltWeeks = wildcard(index);
        if (!rebuiltWeeks) return null;
        permanent = { from: index, weeks: rebuiltWeeks };
      }
      const kept = permanent
        ? permanent.weeks[index - permanent.from]
        : base[index];
      const week = chip === "freehit" ? freeHit(index) : kept;
      if (!week) return null;
      const extra =
        chip === "bboost"
          ? benchPoints(week, scores[index])
          : chip === "3xc"
            ? (scores[index].get(week.lineup.captain) ?? 0)
            : 0;
      path.push({ ...week, points: week.points + extra });
    }
    const total = path.reduce((sum, week) => sum + week.points, 0);
    return { gain: total - baseTotal, weeks: path };
  }

  return { weeks, evaluate };
}
