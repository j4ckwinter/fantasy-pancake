# Recommendation model

`forecast-v6` forecasts expected FPL points per player and gameweek, using parameters calibrated against this season's results (see [Calibration](#calibration)). It compares keeping the squad, single transfers, selected pairs now and rolling before one transfer next week. Forecasts carry measured error that can exceed the gap between closely ranked moves, and forecast transfer gains have been much larger than realised gains.

## Inputs and legality

Inputs are validated players, fixtures, game rules, optional player histories and a 15-player squad with bank, remaining free transfers and selling prices. Money uses integer tenths of £1m. Unconfirmed selling prices use market estimates and every affected recommendation is labelled provisional. Confirming an outgoing price recalculates singles and plans; previously checked prices remain editable even when a move disappears.

Positions, unique ownership, selectability, transaction eligibility, budget and club limits are enforced. Existing real-world club-transfer exceptions can be retained as the baseline, but each proposed resulting squad must restore all club limits. Pair affordability uses both sales together, allowing a downgrade to fund an upgrade.

The horizon begins at `is_next` and spans up to four gameweeks. Before a season with no current event it starts at the first unfinished event. Blanks contribute zero and doubles sum scheduled unfinished fixtures. No next event during an active season means no recommendations.

## History loading and evidence

On comparison, the browser requests history for the owned squad plus up to twelve forecast leaders and four budget options per position. Requests run four at a time with an eight-second overall timeout. Successful histories are reused during the session; failed requests can be retried on another comparison. A coverage message identifies partial fallback. Players outside the history pool remain eligible using season estimates, so this preselection can miss a newly emerging role.

Forecasts use at most eight recent completed matches with known fixture IDs, kickoff before the data snapshot and a round before the planning horizon. Duplicate fixture rows are discarded. Recency weights halve every three matches. These filters do not reconstruct historical news: current season aggregates must never be relabelled as an old snapshot.

## Minutes and performance rates

Recent match-minute outcomes normally blend with half a match of season evidence (calibrated; it was two matches before `forecast-v6`). If the latest four eligible completed matches are all starts with positive minutes, usage before those four matches receives 25% of its normal recency weight and the season minutes prior is also half a match. A subsequent non-start or missed match disables this adjustment. The same usage mixture determines expected minutes, appearance, starts and 60-minute probabilities. The recent-role thresholds are uncalibrated assumptions, not inferred injury dates. Attacking, defensive and rare-event rate estimation retains its existing weighting. The season fallback approximates start/substitute/nonappearance outcomes from starts and average minutes. The resulting distribution separately represents appearance, starts and reaching 60 minutes. A recent starter can therefore gain forecast minutes while someone recently benched loses them. Missing data still has conservative limitations for new signings and club changes.

Season xG and xA rates receive five full-match equivalents of positional prior evidence. xG priors for goalkeeper/defender/midfielder/forward are 0.01/0.06/0.20/0.35; xA priors are 0.01/0.08/0.15/0.10. Expected goals conceded uses a 1.4 prior. Recent rates are blended with eight match-equivalents of these season rates (calibrated; it was two). Bonus receives a season prior of 0.5 per 90 minutes (calibrated; it was zero). Defensive contributions, saves and yellow cards receive zero-valued season priors. Rare red cards, own goals, missed penalties and saved penalties use season totals divided by season per-90 exposure plus twenty zero-event match-equivalents, without recency weighting. If a season total is absent, use only observed eligible history totals and their exposure with the same prior. This deliberately conservative prior prevents one rare incident from being treated as recurring form; it is an explicit assumption, not a fitted event frequency. Weights not listed under [Calibration](#calibration) are modelling assumptions, not fitted parameters.

For each possible minute outcome and fixture, scoring combines:

- One appearance point, plus one for reaching 60 minutes.
- Expected goals weighted 10/6/5/4 by position and expected assists weighted three, scaled by minutes and opponent defence.
- Clean-sheet probability from a Poisson conceded-goal rate, eligible only at 60+ minutes, weighted 4/4/1/0 by position.
- Two defensive contribution points multiplied by the Poisson probability of reaching the per-match threshold: ten for defenders, twelve for midfielders/forwards, none for goalkeepers.
- Goalkeeper save groups of three and saved-penalty rates.
- Smoothed bonus, capped at three per outcome; cards, own goals, missed penalties and goalkeeper/defender conceded-goal groups of two are deducted.

Each match's expected points are then multiplied by a calibrated per-position scale. These are probability-aware approximations, not a complete simulation of FPL rules. Count distributions, event dependence, red-card interactions and bonus competition are simplified. BPS is available in history but not separately added on top of bonus. Set-piece orders explain roles without duplicating attacking credit.

## Opponents and availability

When available, the opponent's venue-specific defence adjusts attacking returns and its venue-specific attack adjusts expected goals conceded. Each strength is normalized against the league's corresponding venue strength and the resulting factor is bounded between 0.65 and 1.45. Missing strengths fall back to FPL difficulty multipliers: attack `1 + (3 − difficulty) × 0.24`, conceded `1 + (difficulty − 3) × 0.22` (calibrated; they were 0.12 and 0.15). FPL published every team strength as zero in 2026/27, so this season the difficulty multipliers decide every fixture adjustment.

The default availability scenario holds current flags constant. Injured, suspended, unavailable and not-in-squad flags score zero; otherwise supplied next-round probability or the existing status fallback applies. The alternative scenario assumes injured, suspended and doubtful players become fully available from the second planning week. Unavailable/not-in-squad players do not recover under this scenario. Neither option predicts a return date.

Single-transfer cards show gains under both scenarios, each against that scenario's own keep baseline. These are sensitivity scenarios, not confidence intervals. Plan cards state the selected scenario; switch the assumption in team review to rerank plans.

## Lineups, transfer cost and search

Each week uses the best legal starting XI and captain under the forecast. Captaincy doubles the selected captain's score. Bench improvements count only when they improve the starting XI. Automatic substitutions, vice-captain fallback and chips are not simulated in transfer scores; the captaincy advice below is guidance only and does not change them.

## Captaincy and bench order

For each horizon week, the captaincy module ranks the chosen starting XI (`captaincy.ts`) for the current squad (`Analysis.captaincy`) or a previewed one (`previewCaptaincy`). It takes the week's per-player forecasts and play chances as values, so it does not depend on how those forecasts are produced.

- **Captain options** rank starters by that week's forecast, highest first, with ties broken by the lower player id. Each option carries its forecast and the gap to the next option. `bestLineup` takes its captain from the same ranking, so the lineup's captain and the top option always agree.
- **Vice-captain** is the second-ranked option. Its value if the captain misses out is not modelled separately.
- **Play chance** for a week is zero without a scheduled fixture. Otherwise it is the week's availability multiplied by the chance of at least one appearance across the week's fixtures, treating fixtures as independent: `availability × (1 − (1 − appearance)^fixtures)`.
- **Bench order** keeps the backup goalkeeper fixed and orders the three outfield reserves by `cover × forecast`, highest first; ties fall to the higher forecast, then the lower id. Cover is the chance that at least one starter the reserve could legally replace fails to play, treating starters as independent. A replacement is legal when the formation stays within each position's minimum and maximum after the swap. Blank-week reserves forecast zero and sort last.

This is an approximation of automatic substitution. Each reserve's cover is computed on its own, so it ignores that an earlier reserve may already have filled a vacancy, the order FPL processes substitutions in, and correlated absences such as a whole club blanking. The ranking adds no output to existing transfer scores, so `forecast-v5` is unchanged.

Single transfers search all eligible players. Paired and delayed plans use four highest horizon-scoring and two cheapest unowned candidates per position. This bounded search is not exhaustive and can miss the best enabling move or a deferred specialist. The best qualifying pair-now and roll-then-transfer plan are shown in their own categories alongside grouped single-transfer options; these are alternatives, not cumulative recommendations.

Each uncovered transfer costs four points and deducts four expected points once. Pairs can cost zero, four or eight. Rolling accrues one free transfer up to the API cap before the next-week move; first-week gain for a delayed move is zero. Remaining free transfers in plan cards are measured immediately after the last planned action, before further weekly accrual. Future purchase and selling prices are held at today's values. No longer sequences or future news changes are simulated.

Net gain must exceed two expected points, or one at the free-transfer cap. These thresholds express an assumed flexibility margin, not a learned value. The season backtest kept them: realised gains did not rise with forecast gain in the decision replay, so the data gives no better cut-off, and two points over four gameweeks still stands for the value of a saved transfer. Model uncertainty can exceed differences between closely ranked moves.

## Evaluation

Unit and browser tests verify calculation behavior, legality, data fallbacks and UI integration; they do not establish forecasting accuracy. Use [pre-deadline snapshot evaluation](evaluation.md) to freeze inputs, actions, starting XIs and captains before observing outcomes. Score against completed results without selecting a better XI afterwards. The baseline policies include model-selected holding, season minutes plus fixtures, and lagged points on the existing squad.

Capture is programmatic. No database or scheduled collection is provided. The retrospective [season backtest](evaluation.md#season-backtest) is the source of the accuracy figures below; it cannot reproduce availability news, so prospective snapshots remain the stronger test. Evaluate multiple untouched deadlines, retain losing recommendations, distinguish unconfirmed budgets, and keep model versions identifiable before tuning parameters.

## Interactive exploration

The shortlist retains three distinct incoming players and up to three outgoing alternatives per incoming player, ranked by the same net score. Optional `lockedPlayerIds` in version-1 settings exclude outgoing players from singles, pairs and deferred plans. Locks are preferences, not changes to forecasts.

`evaluateTransfer` evaluates a specified legal single even below the recommendation threshold. It shares scoring, affordability, position, club-limit and availability-sensitivity logic with recommendations. `previewTransfers` applies actions in their scheduled week and optimises each week’s XI; transfers in one week use combined funds. Previews do not mutate the imported squad. Future prices remain fixed.

Version 4 changes shortlist coverage and planning constraints; it does not claim an improvement in predictive accuracy.

Version 5 adds the adaptive minutes weighting described above. The UI also reports the observed mean minutes across starts in the latest four eligible completed matches (with its sample count); this is distinct from expected minutes per match and is unavailable when there are no recent starts. Current availability remains a separate scoring adjustment.

Version 6 calibrates six named parameters against this season's results and reports forecasts as expected FPL points. Shortlist, plan and preview gains change accordingly; legality, search and thresholds do not.

## Calibration

`src/lib/model/calibrated-parameters.ts` holds every fitted value, next to the uncalibrated values they replace:

| parameter                                                                   | uncalibrated  | calibrated                |
| --------------------------------------------------------------------------- | ------------- | ------------------------- |
| scale on each match's expected points: GK / DEF / MID / FWD                 | 1 / 1 / 1 / 1 | 1.10 / 0.92 / 0.87 / 0.94 |
| season minutes prior, in matches                                            | 2             | 0.5                       |
| season weight in recent attacking and defensive rates, in match-equivalents | 2             | 8                         |
| bonus prior per 90 minutes                                                  | 0             | 0.5                       |
| attack change per difficulty step                                           | 0.12          | 0.24                      |
| goals-conceded change per difficulty step                                   | 0.15          | 0.22                      |

Provenance: fitted on 23 November 2026 from FPL data fetched that day for the 2026/27 season. Training used forecasts of GW3–6 made at the GW3–6 deadlines; validation used forecasts made at the GW7–10 deadlines (targets GW7–10). The fit minimises training mean squared error per player-gameweek by coordinate search over a fixed grid of plausible values, two passes, refitting the position scales by least squares at each step and rounding them to two decimals. Several values sit at the edge of that grid; the grid is the bound on how far one early-season sample may move the model. Refit with more gameweeks before trusting these values beyond this season. See [season backtest](evaluation.md#season-backtest) for how inputs are rebuilt without leaks.

Validation results per player per gameweek (6,680 player-gameweeks; all players are treated as available):

|              | MAE, all | MAE, players who appeared | bias, all | Spearman of horizon totals |
| ------------ | -------- | ------------------------- | --------- | -------------------------- |
| uncalibrated | 1.135    | 1.962                     | −0.06     | 0.763                      |
| calibrated   | 1.111    | 1.934                     | −0.14     | 0.764                      |

By position, calibration lowered validation MAE for defenders (1.29 → 1.28), midfielders (1.13 → 1.09) and forwards (1.14 → 1.13) but raised it for goalkeepers (0.67 → 0.70). Rank correlation barely moved, and defenders' top-10 hit rate fell (0.50 → 0.35). Bias became slightly more negative, because shrinking high forecasts also lowers fringe players' small forecasts. The improvement met the adoption rule but is small; treat it as a modest gain, not a step change.

In the decision replay (125 seeded, ownership-weighted squads at the GW3–7 deadlines, which overlap the training period), the calibrated model's best single transfer had a mean forecast gain of 7.6 points over four gameweeks but realised 1.4 points over holding (standard error 1.4), beating holding for 57% of squads. Uncalibrated, it forecast 11.2 and realised 1.0. The best transfers chosen by season points per match and by points over the previous six matches lost 3.6 points on average (the two baselines coincide this early, when no player has more than six earlier matches). Forecast gains are therefore heavily optimistic: picking the largest of thousands of noisy differences inflates the winner.

The planner quotes these measurements in a dated note below the shortlist and in each incoming player's risks. The quoted figures live in `src/lib/model/forecast-accuracy.ts`; update them, and their date, whenever the backtest is rerun or the parameters change.
