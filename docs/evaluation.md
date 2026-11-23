# Evaluating transfer recommendations

The planner UI no longer offers snapshot downloads. The evaluation library can create a versioned snapshot programmatically before the first target deadline. It contains the exact player/fixture data, available histories, settings, confirmed-selling-price IDs, capture timestamp and frozen policies. It does not automatically run on a schedule or upload data. Save the exported JSON somewhere durable before the deadline.

`createSnapshot(data, settings, analysis, confirmedSellingPriceIds, capturedAt)`, exported from `src/lib/evaluation.ts`, freezes each week's starting XI and captain for:

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

## Season backtest

The season backtest replays this season's completed deadlines to measure forecast accuracy and fit the [calibrated parameters](model.md#calibration). It complements snapshot evaluation; it does not replace prospective snapshots, because it cannot see what managers saw at each deadline.

```sh
node scripts/fetch-backtest-data.ts
node scripts/backtest.ts .cache/backtest/<date> > backtest.json
```

The first script caches `bootstrap-static`, `fixtures` and every player's `element-summary` under `.cache/backtest/<date>/`, which is gitignored. It sends one request at a time with at least 300ms between requests and resumes from files already cached. The second script reads the cache, performs no network requests and writes a JSON report to stdout. Never commit the cached data.

For each completed gameweek D from GW3 onward, the backtest rebuilds what the model could have seen just before D's deadline:

- History rows count only when their round is before D and their kickoff is before D's deadline.
- Season aggregates (minutes, starts, xG, xA, xGC, defensive contributions, saves, bonus, cards, own goals and penalties) are summed from those rows, never taken from current bootstrap totals.
- Price and ownership come from the latest earlier row's `value` and `selected`. Club comes from that row's fixture, so mid-season moves between Premier League clubs are respected.
- Players with no earlier row were not yet in the game and are left out.
- Fixtures count as finished only if they kicked off before the deadline.

Known gaps and leaks:

- Every player is treated as available, because historical injury and suspension flags cannot be recovered. Measured error therefore includes unforeseeable absences that the live app partly handles through flags.
- Set-piece orders are cleared, since only current orders are published. They affect only reasons text.
- Fixture difficulty, schedule changes and team strengths come from the current data. FPL published all team strengths as zero this season, so the model used difficulty multipliers throughout and no strength leak arises. Difficulty ratings and rescheduled fixtures are a small known leak.
- Players removed from the game before the data was fetched are missing.

The model forecasts the next four gameweeks from each deadline, and each forecast is compared with the player's actual `total_points` for that round. Double gameweeks sum both rows; a blank scores zero. Reported per position and overall:

- mean absolute error and bias per player per gameweek, over all players and over players who appeared;
- Spearman rank correlation of horizon totals, averaged over deadlines;
- the top-N hit rate: the share of the model's top N (10 per position, 20 overall) whose actual total reached the N-th best actual total.

The split is time-ordered. Training uses forecasts for gameweeks up to GW6 made at deadlines GW3–6. Validation uses forecasts made at deadlines from GW7 onward, after every training outcome was known. Calibrated values are adopted only if they lower validation mean absolute error and raise validation rank correlation over the uncalibrated values.

The decision replay samples 25 squads per deadline whose four-week horizon has finished. Each slot is drawn with probability proportional to the square of that player's ownership at the deadline, within the £100.0m budget and club limit, using a fixed seed. For each squad, the model's best single transfer is compared with holding and with the best single transfer under two baselines: season points per match and points over the previous six matches. All policies pick their XI and captain with the model's forecast, so the comparison isolates the transfer choice. The model's transfer counts as recommended when its forecast gain exceeds the shortlist threshold.
