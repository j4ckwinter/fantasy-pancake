import type { Analysis } from "@/lib/model";
import type { Selection } from "./selection";

export function includeSelectedOption(
  analysis: Analysis,
  selection: Selection | null,
): Analysis {
  if (selection?.move) {
    const move = selection.move;
    const matches = (candidate: typeof move) =>
      candidate.outId === move.outId && candidate.inId === move.inId;
    return {
      ...analysis,
      moves: analysis.moves.some(matches)
        ? analysis.moves.map((candidate) =>
            matches(candidate) ? move : candidate,
          )
        : [...analysis.moves, move],
    };
  }
  if (selection?.plan) {
    const plan = selection.plan;
    const matches = (candidate: typeof plan) =>
      candidate.actions.length === plan.actions.length &&
      candidate.actions.every((action, index) => {
        const selected = plan.actions[index];
        return (
          action.week === selected.week &&
          action.outId === selected.outId &&
          action.inId === selected.inId
        );
      });
    return {
      ...analysis,
      plans: (analysis.plans ?? []).some(matches)
        ? (analysis.plans ?? []).map((candidate) =>
            matches(candidate) ? plan : candidate,
          )
        : [...(analysis.plans ?? []), plan],
    };
  }
  return analysis;
}
