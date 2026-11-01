# Project architecture

Read the Code structure section of [README.md](README.md#code-structure) before changing application code. Preserve these responsibility boundaries as the project evolves.

## Where changes belong

| Responsibility                                                    | Owner                                                   |
| ----------------------------------------------------------------- | ------------------------------------------------------- |
| Next.js routes, layouts and global foundations                    | `src/app/`                                              |
| Planner screen composition                                        | `src/features/planner/planner.tsx`                      |
| Planning session state and actions                                | `src/features/planner/use-planner.ts`                   |
| Browser HTTP requests and response validation                     | `src/features/planner/api.ts`                           |
| Saved-settings compatibility, import defaults and price estimates | `src/features/planner/settings.ts`                      |
| Rendering and local UI interactions                               | `src/features/planner/components/`                      |
| Planner styling                                                   | `src/features/planner/planner.css` and component styles |
| Recommendation orchestration and public model exports             | `src/lib/model.ts`                                      |
| Scoring, squad rules, scheduling and lineup selection             | `src/lib/model/`                                        |
| Server-side FPL access and caching                                | `src/lib/fpl.ts`                                        |
| Validated data contracts                                          | `src/lib/schemas.ts`                                    |

Snapshot capture and outcome accounting belong in `src/lib/evaluation.ts`; browser downloads belong in `src/features/planner/snapshot.ts`, and the offline evaluation entry point is `scripts/evaluate-snapshot.ts`. Keep evaluation decisions frozen before outcomes and version material model changes.

## Rules for iteration

- Keep route files and screen composition thin. Add behavior to its existing owner rather than rebuilding a large page component.
- Give presentation components data and callbacks. Keep fetching and persistence out of them. Local form drafts, disclosure state, focus and other DOM effects can stay with the component that owns them.
- Keep shared session transitions in the controller hook. Components should request actions rather than coordinate several session-state setters.
- Keep model calculations independent of React, Next.js, browser storage and HTTP. Call the public model entry point from features; model internals must not depend on feature or route code.
- Validate external and persisted data at the owning boundary using the existing schemas. Supply storage to settings functions rather than hiding browser access inside them.
- Reuse existing domain rules, price conversions and formatting where applicable. Extract shared code when it represents the same responsibility; avoid generic utility collections, speculative interfaces or class hierarchies just to satisfy SOLID/DRY terminology.
- Put new feature-specific code under `src/features/<feature>/`. Promote code to a shared module only when there are real consumers with the same needs. Reuse Pancake UI primitives for generic controls.
- Preserve public model exports and saved-settings compatibility unless the requested change requires a deliberate migration. Preserve behavior and appearance during refactoring.
- When a requirement justifies changing a boundary, explain the reason and update this file and the README architecture overview with the implementation.

## Checking a change

Use the relevant checks documented in [README.md](README.md#verification). For refactors, establish a baseline and repeat the affected checks afterwards. Exercise changed user flows on desktop and mobile when layout or interaction is affected. Report checks actually run and any gaps. Before finishing, check that new code follows the ownership rules above.

Keep project guidance outside the generated Next.js block below.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
