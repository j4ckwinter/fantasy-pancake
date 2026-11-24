# Recommendation model

`forecast-v7` forecasts expected FPL points per player and gameweek, using parameters calibrated against this season's results (see [Calibration](#calibration)). It compares keeping the squad, single transfers and multi-week plans found by one bounded search: the best plan over the horizon, pairs now and rolling before one transfer next week. Forecasts carry measured error that can exceed the gap between closely ranked moves, and forecast transfer gains have been much larger than realised gains.

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

## Transfer threshold

Single transfers search all eligible players and must gain more than two expected points net of any hit, or one at the free-transfer cap (`transfer-threshold.ts`). These thresholds express an assumed flexibility margin, not a learned value. The season backtest kept them: realised gains did not rise with forecast gain in the decision replay, so the data gives no better cut-off, and two points over four gameweeks still stands for the value of a saved transfer. Model uncertainty can exceed differences between closely ranked moves.

## Multi-week plans

One search (`plan-search.ts`) builds every plan. It walks the horizon a week at a time and, in each week, chooses zero, one or two transfers, carrying the squad, bank, selling prices and free transfers forward. Free transfers follow `transfer-rules.ts`: each uncovered transfer costs four points, unused transfers accrue one a week up to the API cap, and the transfers left after a week's moves are what carry into the next accrual. Each week's legality comes from `transfer-legality.ts`, so squad shape, locks, unique ownership, combined-funds budget and club limits apply to every week's batch. A starting squad over a club limit can be held, but any week with transfers must leave it legal.

- **Objective.** A plan's value is the sum over the horizon of each week's best XI, captain doubled, minus hits. Weeks after the last move hold the squad. Gain is that value less the value of holding throughout, so every plan states its own expected points against holding.
- **Margin.** Plans are ranked by gain less a margin: the net-gain threshold for each transfer, plus the threshold again for each transfer that takes a hit, using the at-cap threshold when that week starts at the cap. A plan is offered only when its gain beats its margin, so a two-transfer plan needs more than four points and a hit transfer needs more than four points plus its hit. This is deliberate caution. In the season replay the model's best single transfer forecast far more than it realised (the dated figures are in `forecast-accuracy.ts` and under [Calibration](#calibration)), and choosing the best of many noisy sequences compounds that optimism.
- **Candidates.** Incoming players come from a pool of the four highest horizon-scoring and two cheapest unowned, transferable players per position (`plan-candidates.ts`). Every outgoing player that is not locked is paired with every pool player in its position.
- **Pairs.** A week's pairs are ranked by the sum of their two single-transfer gains, ignoring budget and club limits so that a downgrade can fund an unaffordable upgrade. Pairs start from the eight best singles, and only the sixteen best-estimated legal pairs are scored exactly.
- **Beam.** After each week the search keeps the twenty best partial plans, plus the best for each free-transfer count and each number of transfers made, so banking a transfer is never pruned in favour of moving now. Identical squads with the same bank and free transfers merge. A week's moves are listed by outgoing then incoming player id, and a pair that exchanges the same players as one already scored is skipped. Ties prefer fewer transfers, then later moves, then that id ordering, so results depend only on player ids, not on the order of the squad.
- **Plans shown.** Plan ahead shows the best plan and up to three distinct alternatives: the best without hits, with a single transfer, holding this week, or moving this week, whichever differ from the best. Plans count as the same when they move the same players in the same weeks, whoever is paired with whom. Two transfers now and roll then move are the same search restricted to two transfers in the first week, or one in the second.

Each plan reports, per week, its transfers, hit, free transfers before and after the moves, bank after the moves, the week's best XI and its gain over holding net of the hit. Weekly gains are rounded from the running total, so they add up exactly to the plan's gain. Plan totals report free transfers immediately after the last planned move, before further accrual.

This search is bounded and can miss the best plan: a player outside the pool, a pair outside the best-estimated sixteen, or a sequence the beam pruned. How close it gets was measured on 23 November 2026 with FPL data fetched that day: 30 real squads (five sampled squads at each of the GW9, GW11 and GW13 deadlines, each with one and with three free transfers) were compared with a far wider search (a beam of 60, 90 pair seeds and 400 scored pairs). The wider search found a better plan for 3 of the 30 squads, by at most 0.89 points after margins, and 0.06 points on average across all 30. It took about 1.5 seconds a squad against about 56 milliseconds. With a beam of six, the wider search did better for 14 of the 30, by up to 2.66 points. Unit tests compare the search with exhaustive enumeration on four-week markets with three tradeable players, where the pair and seed limits bind, and it matches every time; those markets are too small to show what the beam costs on a full squad. Prices stay at today's values for every week. Future injury news, price changes, chips and automatic substitutions are not simulated, and the value of free transfers still held at the end of the horizon is ignored. Only the first week's moves need making now, and plans should be rerun each week.

## Chips

`Analysis.chips` advises on the chips you have left. It needs FPL's chip rules from `bootstrap-static` and the chips you have played from your entry history, both read at import. Settings saved before chips were recorded have no played chips, so the planner asks you to refresh from FPL rather than guess.

**Availability** (`chip-availability.ts`) reads each chip definition as a window, `start_event` to `stop_event`. FPL publishes two of each chip this season, one per half (GW1–19 or GW2–19, then GW20–38). A played chip uses up the window its gameweek falls in. A chip is available when an unused window overlaps the horizon, and only the horizon weeks inside that window are offered. When the horizon spans both halves and neither is used, each half's chip is listed separately. Otherwise the chip is used (with the gameweek, and the next window if there is one) or outside its window. Chips FPL adds that the planner does not know are ignored.

**Valuation** (`chip-advice.ts`) scores each available chip in each of its horizon weeks against your current squad with no transfers:

- **Triple Captain** gains the captain's expected points once more, using the captain from the captaincy ranking above.
- **Bench Boost** gains the expected points of the four players `bestLineup` leaves on the bench.
- **Free Hit** gains the best one-week XI the search finds, minus your own XI that week. The budget is your bank plus every selling price; owned players cost their selling price and others their current price. The squad must meet position counts and the club limit. The search (`affordable-squad.ts`) is bounded: for every legal formation it beam-searches starters from the eight highest-scoring and four best-value players per position, then fills the bench with the cheapest players from clubs still under the limit. It can miss the true best squad. If it finds nothing better than your XI, the gain is zero. If it finds no legal squad at all in any horizon week, for example when your squad keeps a real-world club-limit exception and nothing else is affordable, the chip is shown as not valued rather than as a zero-gain hold.
- **Wildcard** is listed with its window, but its valuation is pending until multi-week planning can value a squad rebuilt with unlimited transfers.

The best week is the one with the highest gain. A chip is recommended only when that gain clears its threshold: 8 points for Triple Captain, 15 for Bench Boost and 20 for Free Hit (`CHIP_PLAY_THRESHOLD_POINTS`). Below it, the advice is to hold. The exception is a chip whose window ends inside the horizon, such as a first-half chip near GW19 or any chip near GW38. Holding it is worth nothing, so the advice is to play it in its best remaining week with a positive gain, whatever the bar, and the panel says when it expires. The Wildcard row carries the same expiry flag while its valuation is pending. FPL allows one chip per gameweek, so the planner tries every way of giving the qualifying chips distinct weeks (at most a handful of chips over four weeks) and keeps the one with the largest total gain. A chip can therefore be moved off its own best week when another chip needs that week more. A chip left without a week holds and names the chip that took its week. The planner also never advises Free Hits in consecutive gameweeks, which can only happen across the GW19/GW20 halves. FPL's published rules (`bootstrap-static` chip overrides and game settings) don't say whether back-to-back Free Hits are allowed, so the safe choice is not to advise them; the held Free Hit says why.

The thresholds are assumptions, not fitted values. They stand for a week clearly better than a typical one, which usually means a double or blank gameweek. As a sanity check on 23 November 2026 live data (horizon GW12–15, no doubles), a synthetic squad of regular starters with a playing bench was worth 4.7–5.4 for Triple Captain, 9.8–12.1 for Bench Boost and 9.3–12.1 for Free Hit, so all three held. The squads were built from public player data only.

Limits:

- The horizon is four gameweeks. A chip's value outside it is unknown, so "hold" means "nothing in the next four weeks clears the bar", not "save it for a specific week".
- Values use the current squad. They ignore transfers you plan before the chip week, automatic substitutions (so Bench Boost slightly overstates, since a reserve sometimes plays anyway), and the vice-captain.
- Free Hit picks the best of very many squads, so like the top transfers in the [decision replay](#calibration) its forecast gain is likely to run optimistic.
- Chip advice adds an output but changes no transfer score, so `forecast-v6` is unchanged.

## Evaluation

Unit and browser tests verify calculation behavior, legality, data fallbacks and UI integration; they do not establish forecasting accuracy. Use [pre-deadline snapshot evaluation](evaluation.md) to freeze inputs, actions, starting XIs and captains before observing outcomes. Score against completed results without selecting a better XI afterwards. The baseline policies include model-selected holding, season minutes plus fixtures, and lagged points on the existing squad.

Capture is programmatic. No database or scheduled collection is provided. The retrospective [season backtest](evaluation.md#season-backtest) is the source of the accuracy figures below; it cannot reproduce availability news, so prospective snapshots remain the stronger test. Evaluate multiple untouched deadlines, retain losing recommendations, distinguish unconfirmed budgets, and keep model versions identifiable before tuning parameters.

## Interactive exploration

The shortlist retains three distinct incoming players and up to three outgoing alternatives per incoming player, ranked by the same net score. Optional `lockedPlayerIds` in version-1 settings exclude outgoing players from singles, pairs and deferred plans. Locks are preferences, not changes to forecasts.

`evaluateTransfer` evaluates a specified legal single even below the recommendation threshold. It shares scoring, affordability, position, club-limit and availability-sensitivity logic with recommendations. `previewTransfers` applies actions in their scheduled week and optimises each week’s XI; transfers in one week use combined funds. Previews do not mutate the imported squad. Future prices remain fixed.

Version 4 changes shortlist coverage and planning constraints; it does not claim an improvement in predictive accuracy.

Version 5 adds the adaptive minutes weighting described above. The UI also reports the observed mean minutes across starts in the latest four eligible completed matches (with its sample count); this is distinct from expected minutes per match and is unavailable when there are no recent starts. Current availability remains a separate scoring adjustment.

Version 6 calibrates six named parameters against this season's results and reports forecasts as expected FPL points. Shortlist, plan and preview gains change accordingly; legality, search and thresholds do not.

Version 7 replaces the separate pair and roll searches with the multi-week plan search above. Pair and roll plans now come from the same search, rank pairs by estimated gain before scoring the best sixteen exactly instead of scoring every pair in the pool, and must clear the threshold for each transfer and hit rather than once per plan. Forecasts and single transfers do not change.

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

By position, calibration lowered validation MAE for defenders (1.29 → 1.28), midfielders (1.13 → 1.08) and forwards (1.14 → 1.13) but raised it for goalkeepers (0.67 → 0.70). Rank correlation did not change beyond noise: its rise of 0.0013 sits inside a player-clustered bootstrap interval of −0.0005 to +0.0044, so only the error reduction is a measured improvement. Across all players it mostly measures who plays at all; among the model's top 150 it is only about 0.3–0.4, and calibration helped it at two validation deadlines and hurt it at the other two. Defenders' top-10 hit rate fell (0.50 → 0.35). Bias became slightly more negative, because shrinking high forecasts also lowers fringe players' small forecasts. The improvement met the adoption rule but is small; treat it as a modest gain, not a step change.

In the decision replay (125 seeded, ownership-weighted squads at the GW3–7 deadlines, which overlap the training period), the calibrated model's best single transfer had a mean forecast gain of 7.6 points over four gameweeks but realised 1.4 points over holding (standard error 1.4), beating holding for 57% of squads. Uncalibrated, it forecast 11.2 and realised 1.0. The best transfers chosen by season points per match and by points over the previous six matches lost 3.6 points on average (the two baselines coincide this early, when no player has more than six earlier matches). Forecast gains are therefore heavily optimistic: picking the largest of thousands of noisy differences inflates the winner.

The planner quotes these measurements in a dated note below the shortlist and in each incoming player's risks. The quoted figures live in `src/lib/model/forecast-accuracy.ts`; update them, and their date, whenever the backtest is rerun or the parameters change.
