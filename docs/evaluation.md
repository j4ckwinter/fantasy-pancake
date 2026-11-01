# Evaluating transfer recommendations

The planner UI no longer offers snapshot downloads. The evaluation library can create a versioned snapshot programmatically before the first target deadline. It contains the exact player/fixture data, available histories, settings, confirmed-selling-price IDs, capture timestamp and frozen policies. It does not automatically run on a schedule or upload data. Save the exported JSON somewhere durable before the deadline.

`createSnapshot(data, settings, analysis, confirmedSellingPriceIds, capturedAt)` in `src/lib/evaluation.ts` freezes each week's starting XI and captain for:

- Keeping the squad with the model's selection.
- Each shortlisted single transfer.
- Each shortlisted paired or delayed transfer plan.
- Keeping the squad with a simple season-minutes-and-fixture-difficulty selection.
- Keeping the squad with a previous-six-match-points selection.

The two simple baselines test team selection on the existing squad; they do not search alternative transfers. The lagged-points policy reports the fraction of owned players with any history, and players without history score zero when selecting its lineup. Treat that baseline cautiously when coverage is incomplete.

The model identifier is `forecast-v5`. Increment it when forecasting or planning behavior changes materially. Existing exported snapshots retain their frozen decisions; evaluation never reruns the latest forecast to choose players retrospectively.

## Capture safeguards

Capture must precede the first target deadline. The data fetch timestamp cannot be later than capture, and input history cannot contain future or target-gameweek rows. Empty horizons cannot be captured. Runtime schemas validate snapshot and outcome files.

These are consistency checks, not authenticated provenance: browser clocks and downloaded JSON can be altered, and current API data cannot reconstruct past injury news, fixture changes or prices. Do not relabel a newly captured snapshot as an earlier date to create a backtest. Keep original files and archive successive deadlines prospectively.

Unconfirmed selling prices are recorded on each transfer policy. Such policies may not have been affordable in the actual team and must be separated from confirmed-price policies when interpreting results.

## Evaluate after matches finish

Use the Node version pinned in `.nvmrc` and the project's installed dependencies:

```sh
node scripts/evaluate-snapshot.ts snapshot.json outcomes.json
```

The script reads both files, validates them, writes a JSON report to stdout and performs no network requests or file writes. The outcomes file has this shape:

```json
{
  "histories": {
    "115": []
  },
  "fixtures": [],
  "completedGameweeks": []
}
```

For every player selected by any frozen policy, populate `histories[playerId]` with the player's `history` array from `/api/element-summary/{playerId}/`. Populate `fixtures` with the full later `/api/fixtures/` response, including rescheduled fixtures. Populate `completedGameweeks` with event IDs whose `finished` flag is true in the later bootstrap response. The minimal example above illustrates the file shape only; its empty schedule is rejected when the snapshot contains fixtures. The actual schedule must retain every fixture ID from the snapshot, including fixtures postponed to `event: null` or moved outside the evaluation horizon. Missing fixture IDs trigger an actionable error rather than being mistaken for blank weeks.

The report sums the actual points of the frozen starters, doubles the frozen captain's points, and subtracts the policy's total hit once. Predictions stay frozen, but scoring uses the realized schedule: a completed blank week contributes zero, and doubles sum both fixture outcomes. Each target gameweek must be marked complete. Each expected player/fixture requires exactly one outcome row and a finished fixture; missing, unfinished or duplicate outcomes produce `status: "incomplete"` and `points: null`. Zero-minute outcomes must be supplied explicitly. No automatic substitutions or vice-captain fallback are simulated.

`gainOverRoll` is calculated only when both the policy and roll policy are complete. Report results across multiple untouched deadlines, including losing recommendations and all hits. A passing unit test establishes accounting behavior; it does not establish forecast accuracy.

If the schedule changes after capture, leave the prediction snapshot intact and supply the actual schedule in the outcomes file. The original lineup decisions still stand, so a postponement can legitimately reduce their realized value. The evaluator uses players' club affiliations at capture; real-world club transfers during the horizon need separate review. This evaluator is a prospective research tool, not an exact reconstruction of an FPL manager's live score or an exhaustive historical backtester.

Programmatic capture freezes the recommendations supplied in `analysis`. There is no planner export control or automatic inclusion of the currently selected custom comparison.
