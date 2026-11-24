# Project architecture

Read the Code structure section of [README.md](README.md#code-structure) before changing application code. Preserve these responsibility boundaries as the project evolves.

## Where changes belong

| Responsibility                                                    | Owner                                                            |
| ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| Next.js routes, layouts and global foundations                    | `src/app/`                                                       |
| Planner screen composition                                        | `src/features/planner/planner.tsx`                               |
| Planning session state and its transitions                        | `src/features/planner/session.ts`                                |
| Import, comparison and refresh flows                              | `src/features/planner/use-planner.ts`                            |
| Restoring a saved team on load                                    | `src/features/planner/restore-session.ts`                        |
| Which operation is running and whether a result is still current  | `src/features/planner/use-operation.ts`                          |
| Loaded FPL data and when it expires                               | `src/features/planner/use-planner-data.ts`, `freshness.ts`       |
| Player details dialog data                                        | `src/features/planner/use-player-details.ts`                     |
| Player and club lookups                                           | `src/features/planner/players.ts`                                |
| Money, expected-points gain, accuracy note and label formatting   | `src/features/planner/format.ts`                                 |
| Browser HTTP requests and response validation                     | `src/features/planner/api.ts`                                    |
| Saved-settings compatibility, import defaults and price estimates | `src/features/planner/settings.ts`                               |
| Chip names, advice wording and which chip week is previewed       | `src/features/planner/chips.ts`                                  |
| Selections, their labels and plan categories                      | `src/features/planner/selection.ts`                              |
| Planner status, notice and error messages                         | `src/features/planner/messages.ts`                               |
| Rendering and local UI interactions                               | `src/features/planner/components/`                               |
| Design tokens, the dark palette and shadcn's theme variables      | `src/app/tokens.css`                                             |
| Named layout breakpoints for media queries and scripts            | `src/app/breakpoints.ts`                                         |
| Rules that keep style values on tokens and breakpoints            | `src/app/style-tokens.test.ts`                                   |
| Generic controls: shadcn primitives and the app's wrappers        | `src/components/ui/`, `src/components/`                          |
| Styles that several planner components share                      | `src/features/planner/shared.css`                                |
| A component's own styles, imported by that component              | `src/features/planner/components/<component>.css`                |
| Recommendation orchestration and public model exports             | `src/lib/model.ts`                                               |
| Scoring, squad rules, scheduling and lineup selection             | `src/lib/model/`                                                 |
| Hit cost, free-transfer cap and weekly accrual                    | `src/lib/model/transfer-rules.ts`                                |
| Net-gain threshold a transfer must clear                          | `src/lib/model/transfer-threshold.ts`                            |
| Which plans are offered, their alternatives and stated limits     | `src/lib/model/planning.ts`                                      |
| Multi-week beam search and its named bounds                       | `src/lib/model/plan-search.ts`                                   |
| Incoming candidate pool for plans                                 | `src/lib/model/plan-candidates.ts`                               |
| A plan's weekly hits, free transfers, bank and gains              | `src/lib/model/plan-accounting.ts`                               |
| Whether a transfer or batch is legal, and the squad it leaves     | `src/lib/model/transfer-legality.ts`                             |
| Reasons shown for a single transfer                               | `src/lib/model/transfer-reasons.ts`                              |
| Risk messages shown for an incoming player                        | `src/lib/model/player-risks.ts`                                  |
| Rounding of reported expected points                              | `src/lib/model/round-score.ts`                                   |
| Captain ranking, vice-captain and bench order                     | `src/lib/model/captaincy.ts`                                     |
| Chance a player appears in a gameweek                             | `src/lib/model/play-chance.ts`                                   |
| Weekly captaincy for the current or a previewed squad             | `src/lib/model/captaincy-preview.ts`                             |
| Which chips remain and the weeks each can be played               | `src/lib/model/chip-availability.ts`                             |
| Chip values, best weeks and hold thresholds                       | `src/lib/model/chip-advice.ts`                                   |
| One chip per gameweek: which chip plays which week                | `src/lib/model/chip-weeks.ts`                                    |
| Best affordable one-week Free Hit squad                           | `src/lib/model/free-hit-squad.ts`                                |
| Position ids; per-position scoring weights and attacking priors   | `src/lib/model/position.ts`; `scoring.ts`, `forecast-history.ts` |
| Match length, 60-minute appearances and recency half-life         | `src/lib/model/match-minutes.ts`, `recency.ts`                   |
| Fitted forecast parameters and their uncalibrated reference       | `src/lib/model/calibrated-parameters.ts`                         |
| Measured forecast accuracy quoted to users                        | `src/lib/model/forecast-accuracy.ts`                             |
| Server-side FPL access and caching                                | `src/lib/fpl.ts`                                                 |
| API route error responses and FPL id parsing                      | `src/app/api/error-response.ts`, `fpl-id.ts`                     |
| Validated data contracts                                          | `src/lib/schemas.ts`                                             |

`src/lib/evaluation.ts` is the public evaluation entry point. Snapshot and outcome file contracts belong in `src/lib/evaluation/snapshot-schema.ts`, capture safeguards in `capture-checks.ts`, snapshot capture in `capture.ts`, the simple baseline policies in `baseline-policies.ts` and outcome accounting in `outcomes.ts`. The offline evaluation entry point is `scripts/evaluate-snapshot.ts`; the planner UI offers no snapshot download. The season backtest rebuilds leak-free deadline inputs in `backtest-inputs.ts` (archive contracts in `backtest-schema.ts`), scores forecasts in `backtest.ts` with metrics in `backtest-metrics.ts`, replays transfer decisions in `backtest-decisions.ts` on squads from `backtest-squads.ts`, fits parameters in `calibration-fit.ts` and sets its window, split and adoption rule in `backtest-run.ts`. `scripts/fetch-backtest-data.ts` caches FPL data under the gitignored `.cache/`, and `scripts/backtest.ts` runs the backtest on it. Keep evaluation decisions frozen before outcomes and version material model changes.

## Rules for iteration

- Keep route files and screen composition thin. Add behavior to its existing owner rather than rebuilding a large page component.
- Give presentation components data and callbacks. Keep fetching and persistence out of them. Local form drafts, disclosure state, focus and other DOM effects can stay with the component that owns them.
- Keep session transitions in the `session.ts` reducer and async flows in `use-planner.ts`. Components should request actions rather than coordinate several pieces of session state.
- Keep model calculations independent of React, Next.js, browser storage and HTTP. Call the public model entry point from features; model internals must not depend on feature or route code.
- Validate external and persisted data at the owning boundary using the existing schemas. Supply storage to settings functions rather than hiding browser access inside them.
- Reuse existing domain rules, price conversions and formatting where applicable. Extract shared code when it represents the same responsibility; avoid generic utility collections, speculative interfaces or class hierarchies just to satisfy SOLID/DRY terminology.
- Put new feature-specific code under `src/features/<feature>/`. Promote code to a shared module only when there are real consumers with the same needs. Build generic controls from shadcn: vendored primitives live in `src/components/ui/` (edit them in place for app-wide defaults), and the app's wrappers around them (`field.tsx`, `banner.tsx`, `status-badge.tsx`, `disclosure.tsx`, `empty-state.tsx`) live in `src/components/`.
- Preserve public model exports and saved-settings compatibility unless the requested change requires a deliberate migration. Preserve behavior and appearance during refactoring.
- When a requirement justifies changing a boundary, explain the reason and update this file and the README architecture overview with the implementation.

## Checking a change

Use the relevant checks documented in [README.md](README.md#verification). For refactors, establish a baseline and repeat the affected checks afterwards. Exercise changed user flows on desktop and mobile when layout or interaction is affected. Report checks actually run and any gaps. Before finishing, check that new code follows the ownership rules above.

Build model and evaluation test data from `src/lib/model/test-fixtures.ts` and test behaviour through the public exports of `src/lib/model.ts`, `src/lib/evaluation.ts` and `createFplClient`. Test a model internal directly only when no public export can observe it, as with the separate opponent attack and conceded factors. Give the FPL client a fake `fetch` and clock rather than stubbing globals or waiting on real time.

Keep project guidance outside the generated Next.js block below.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
