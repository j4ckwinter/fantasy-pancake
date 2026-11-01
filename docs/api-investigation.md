# FPL API investigation

Observed on 31 October 2026, before application implementation. Requests were made from Node/macOS-compatible server tooling without authentication. Current event was GW9; next event was GW10. These are observations of the current service, not a stability guarantee.

## Current implementation update

The observations below describe the initial investigation. The current `forecast-v5` pipeline consumes selected per-match histories, venue-specific team strengths and additional scoring events, with partial-data fallback. It offers explicit availability scenarios and bounded paired/deferred plans. See [current model](model.md) and [snapshot evaluation](evaluation.md) for implemented behavior and limits; initial-model descriptions below are historical.

## Endpoints checked

| Endpoint                      | Observed response          | Use and limits                                                                                                                          |
| ----------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/bootstrap-static/`      | 200 JSON                   | Players, teams, events, position limits, game settings and scoring rules. Season-to-date aggregates, current prices and availability.   |
| `/api/fixtures/`              | 200 JSON                   | Scheduled event, opponents, home/away difficulty, kickoff and completion. Nullable events mean unscheduled fixtures.                    |
| `/api/element-summary/115/`   | 200 JSON                   | Per-fixture `history`, future `fixtures`, prior-season aggregate `history_past`.                                                        |
| `/api/entry/1/`               | 200 JSON                   | Current event and entry metadata. App strips personal and league data.                                                                  |
| `/api/entry/1/event/9/picks/` | 200 JSON                   | 15 deadline picks, active chip, historical bank, transfer count and historical hit. No current selling prices or free-transfer balance. |
| `/api/entry/1/history/`       | 200 JSON                   | Gameweek entry results; not a current team-settings endpoint.                                                                           |
| `/api/my-team/1/`             | 403 without authentication | Current private squad settings cannot be imported by this app. No login attempted.                                                      |

Public picks are not a live squad. A Free Hit squad needs correction to the permanent squad. Import searches backwards only when picks return 404; an outage does not silently select older data. New entries without published picks receive an explicit empty-state error.

## Statistics actually present

Bootstrap includes `expected_goals`, `expected_assists`, `expected_goal_involvements`, `expected_goals_conceded`, `minutes`, `starts`, `creativity`, `defensive_contribution`, `clearances_blocks_interceptions`, `recoveries`, `tackles`, `saves`, `bonus`, `bps`, and their applicable per-90 fields. Expected metrics and creativity arrive as numeric strings; runtime schemas validate and normalize them.

`penalties_order`, `corners_and_indirect_freekicks_order` and `direct_freekicks_order` are nullable role indicators. A null order does not establish absence of a role. `chance_of_playing_next_round` may also be null. Status and news are current, not historical snapshots. `form` uses the configured 30-day window; it is not a forecast.

The sampled per-match history includes minutes, starts, xG, xA, expected goals conceded, defensive contributions, fantasy points, kickoff, gameweek, opponent, home/away, historical value and selection counts. `history_past` contains season totals, not prior-season individual match histories.

The initial compact model uses minutes, availability, position-weighted xG/xA, expected goals conceded, defensive involvement, saves and fixture difficulty. These separate opportunity, attacking contribution and defensive role. Creativity and ICT are not added on top of xA/xG because they overlap and are not calibrated to points. Set-piece orders explain a role without adding another scoring bonus. Small attacking samples receive five full-match equivalents of positional prior weight. Season rates can lag recent role changes: recent-match weighting is deliberately not claimed. Player-history access is provided separately for future refinement.

## Rules and information ownership

Live bootstrap reports 15 squad players, 11 starters, at most three per club, 2/5/5/3 positional squad counts, legal starting formation bounds and four extra accumulated free transfers (five total). Current official help says additional transfers cost four points. The model uses the API's squad and formation constraints. An existing squad can temporarily exceed the club limit after a real-world player move; the app allows this confirmed baseline but requires every proposed resulting squad to respect all club limits. [Official exception](https://www.premierleague.com/en/news/4536241). The app requests **remaining** free transfers, not the pre-transfer allowance; already incurred hits are sunk costs shared by both choices.

Users must supply/correct the current squad, bank, actual selling prices and remaining free transfers. Selling prices are initially market-price placeholders, not inferred ownership profits; explicit confirmation is required. The model estimates future minutes, performance rates, availability persistence, fixture effects and the value of flexibility. It does not claim to know purchase prices, chip state, future rotation, or injury recovery dates.

## Access and caching

The bootstrap response advertised `cache-control: max-age=300, stale-while-revalidate=3600, stale-if-error=3600`, `edge-control: max-age=300`, JSON content type and same-origin resource policy. Server access succeeded; browser cross-origin access was not assumed or required. No documented rate limit was found or inferred from successful requests.

Application routes call only the fixed FPL API origin, validate returned JSON, cache valid results for 300 seconds, deduplicate concurrent requests for the same path, bound the process-local cache to 200 entries, and apply a 12-second upstream timeout. Errors and schema failures are not cached. The visible timestamp is the oldest fetch time of the player/fixture inputs, preserved on cache hits. Each server process has its own cache; this is intentionally sufficient for the local first version, not a distributed rate-limiting system.

## Historical evaluation and changes to the brief

Past fixture histories permit limited retrospective experiments using only earlier rows. They do not reconstruct what was known at each deadline: availability news, role orders, schedule changes and fixture difficulty at that time are not archived here. Using current bootstrap totals to score past decisions would leak future information. No valid backtest result is claimed.

The first version therefore labels its result as a **heuristic score**, deducts one score unit per actual hit point as an explicit decision convention, and uses a transparent rolling threshold. Proper future evaluation should save timestamped player/fixture/rule snapshots before deadlines, compare against rolling and a simple minutes-plus-fixture baseline, and measure starting-XI outcomes on held-out future weeks. Historical dataset acquisition and a snapshot database are outside this local-storage version.

The requested four-week horizon becomes up to four near season end. Blank and double gameweeks use actual scheduled fixtures. Unlimited-transfer periods and chips are not modelled. No future fixture means an explicit empty horizon, not an invented projection.

## Sources

- [Live bootstrap API](https://fantasy.premierleague.com/api/bootstrap-static/)
- [Live fixtures API](https://fantasy.premierleague.com/api/fixtures/)
- [Sample player history](https://fantasy.premierleague.com/api/element-summary/115/)
- [Official help and transfer rules](https://fantasy.premierleague.com/es/help)
- [Official 2026/27 changes](https://fantasy.premierleague.com/help/new)
- [Official defensive contribution explanation](https://www.premierleague.com/en/news/4361991)
