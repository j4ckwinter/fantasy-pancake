# Recommendation model

`forecast-v5` is a deterministic comparison heuristic, not a calibrated FPL points forecast. It compares keeping the squad, single transfers, selected pairs now and rolling before one transfer next week. No predictive improvement has yet been established from results.

## Inputs and legality

Inputs are validated players, fixtures, game rules, optional player histories and a 15-player squad with bank, remaining free transfers and selling prices. Money uses integer tenths of £1m. Unconfirmed selling prices use market estimates and every affected recommendation is labelled provisional. Confirming an outgoing price recalculates singles and plans; previously checked prices remain editable even when a move disappears.

Positions, unique ownership, selectability, transaction eligibility, budget and club limits are enforced. Existing real-world club-transfer exceptions can be retained as the baseline, but each proposed resulting squad must restore all club limits. Pair affordability uses both sales together, allowing a downgrade to fund an upgrade.

The horizon begins at `is_next` and spans up to four gameweeks. Before a season with no current event it starts at the first unfinished event. Blanks contribute zero and doubles sum scheduled unfinished fixtures. No next event during an active season means no recommendations.

## History loading and evidence

On comparison, the browser requests history for the owned squad plus up to twelve forecast leaders and four budget options per position. Requests run four at a time with an eight-second overall timeout. Successful histories are reused during the session; failed requests can be retried on another comparison. A coverage message identifies partial fallback. Players outside the history pool remain eligible using season estimates, so this preselection can miss a newly emerging role.

Forecasts use at most eight recent completed matches with known fixture IDs, kickoff before the data snapshot and a round before the planning horizon. Duplicate fixture rows are discarded. Recency weights halve every three matches. These filters do not reconstruct historical news: current season aggregates must never be relabelled as an old snapshot.

## Minutes and performance rates

Recent match-minute outcomes normally blend with two matches of season evidence. If the latest four eligible completed matches are all starts with positive minutes, usage before those four matches receives 25% of its normal recency weight and the season minutes prior falls to half a match. A subsequent non-start or missed match disables this adjustment. The same usage mixture determines expected minutes, appearance, starts and 60-minute probabilities. These thresholds are explicit uncalibrated assumptions, not inferred injury dates. Attacking, defensive and rare-event rate estimation retains its existing weighting. The season fallback approximates start/substitute/nonappearance outcomes from starts and average minutes. The resulting distribution separately represents appearance, starts and reaching 60 minutes. A recent starter can therefore gain forecast minutes while someone recently benched loses them. Missing data still has conservative limitations for new signings and club changes.

Season xG and xA rates receive five full-match equivalents of positional prior evidence. xG priors for goalkeeper/defender/midfielder/forward are 0.01/0.06/0.20/0.35; xA priors are 0.01/0.08/0.15/0.10. Expected goals conceded uses a 1.4 prior. Recent rates are blended with two match-equivalents of these season rates. Defensive contributions, saves, bonus and yellow cards receive zero-valued season priors. Rare red cards, own goals, missed penalties and saved penalties use season totals divided by season per-90 exposure plus twenty zero-event match-equivalents, without recency weighting. If a season total is absent, use only observed eligible history totals and their exposure with the same prior. This deliberately conservative prior prevents one rare incident from being treated as recurring form; it is an explicit assumption, not a fitted event frequency. All weights are explicit modelling assumptions, not fitted parameters.

For each possible minute outcome and fixture, scoring combines:

- One appearance unit, plus one for reaching 60 minutes.
- Expected goals weighted 10/6/5/4 by position and expected assists weighted three, scaled by minutes and opponent defence.
- Clean-sheet probability from a Poisson conceded-goal rate, eligible only at 60+ minutes, weighted 4/4/1/0 by position.
- Two defensive contribution units multiplied by the Poisson probability of reaching the per-match threshold: ten for defenders, twelve for midfielders/forwards, none for goalkeepers.
- Goalkeeper save groups of three and saved-penalty rates.
- Smoothed bonus, capped at three per outcome; cards, own goals, missed penalties and goalkeeper/defender conceded-goal groups of two are deducted.

These are probability-aware approximations, not a complete simulation of FPL rules. Count distributions, event dependence, red-card interactions and bonus competition are simplified. BPS is available in history but not separately added on top of bonus. Set-piece orders explain roles without duplicating attacking credit.

## Opponents and availability

When available, the opponent's venue-specific defence adjusts attacking returns and its venue-specific attack adjusts expected goals conceded. Each strength is normalized against the league's corresponding venue strength and the resulting factor is bounded between 0.65 and 1.45. Missing strengths fall back to FPL difficulty multipliers: attack `1 + (3 − difficulty) × 0.12`, conceded `1 + (difficulty − 3) × 0.15`. These multipliers require calibration.

The default availability scenario holds current flags constant. Injured, suspended, unavailable and not-in-squad flags score zero; otherwise supplied next-round probability or the existing status fallback applies. The alternative scenario assumes injured, suspended and doubtful players become fully available from the second planning week. Unavailable/not-in-squad players do not recover under this scenario. Neither option predicts a return date.

Single-transfer cards show gains under both scenarios, each against that scenario's own keep baseline. These are sensitivity scenarios, not confidence intervals. Plan cards state the selected scenario; switch the assumption in team review to rerank plans.

## Lineups, transfer cost and search

Each week uses the best legal starting XI and captain under the forecast. Captaincy doubles the selected captain's score. Bench improvements count only when they improve the starting XI. Automatic substitutions, vice-captain fallback and chips are not simulated.

Single transfers search all eligible players. Paired and delayed plans use four highest horizon-scoring and two cheapest unowned candidates per position. This bounded search is not exhaustive and can miss the best enabling move or a deferred specialist. The best qualifying pair-now and roll-then-transfer plan are shown in their own categories alongside grouped single-transfer options; these are alternatives, not cumulative recommendations.

Each uncovered transfer costs four actual points and deducts four heuristic units once. Pairs can cost zero, four or eight. Rolling accrues one free transfer up to the API cap before the next-week move; first-week gain for a delayed move is zero. Remaining free transfers in plan cards are measured immediately after the last planned action, before further weekly accrual. Future purchase and selling prices are held at today's values. No longer sequences or future news changes are simulated.

Net gain must exceed two units, or one at the free-transfer cap. These thresholds express an assumed flexibility margin, not a learned value. Model uncertainty can exceed differences between closely ranked moves.

## Evaluation

Unit and browser tests verify calculation behavior, legality, data fallbacks and UI integration; they do not establish forecasting accuracy. Use [pre-deadline snapshot evaluation](evaluation.md) to freeze inputs, actions, starting XIs and captains before observing outcomes. Score against completed results without selecting a better XI afterwards. The baseline policies include model-selected holding, season minutes plus fixtures, and lagged points on the existing squad.

Capture is manual via the download button. No database, scheduled collection or retrospective accuracy claim is provided. Evaluate multiple untouched deadlines, retain losing recommendations, distinguish unconfirmed budgets, and keep model versions identifiable before tuning parameters.

## Interactive exploration

The shortlist retains three distinct incoming players and up to three outgoing alternatives per incoming player, ranked by the same net score. Optional `lockedPlayerIds` in version-1 settings exclude outgoing players from singles, pairs and deferred plans. Locks are preferences, not changes to forecasts.

`evaluateTransfer` evaluates a specified legal single even below the recommendation threshold. It shares scoring, affordability, position, club-limit and availability-sensitivity logic with recommendations. `previewTransfers` applies actions in their scheduled week and optimises each week’s XI; transfers in one week use combined funds. Previews do not mutate the imported squad. Future prices remain fixed.

Version 4 changes shortlist coverage and planning constraints; it does not claim an improvement in predictive accuracy.

Version 5 adds the adaptive minutes weighting described above. The UI also reports the observed mean minutes across starts in the latest four eligible completed matches (with its sample count); this is distinct from expected minutes per match and is unavailable when there are no recent starts. Current availability remains a separate scoring adjustment.
