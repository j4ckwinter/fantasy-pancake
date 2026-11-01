# Fantasy Pancake

[live app](https://fantasy-pancake.vercel.app) · [CI](https://github.com/j4ckwinter/fantasy-pancake/actions/workflows/verify.yml)

fpl transfers are easy to overthink. bring your squad, compare a few moves, and see what happens to your starting XI over the next four gameweeks. sometimes the best move is to roll.

built with Next.js, React, TypeScript and Pancake UI. no login, no automatic transfers. your settings stay in your browser.

## run locally

use the Node version in [.nvmrc](.nvmrc). with nvm:

```sh
nvm install
nvm use
npm ci
npm run dev
```

open http://localhost:3000 and enter your FPL team ID. the server needs access to FPL; no API keys or environment variables are needed.

## use it

import your team, then compare singles, two transfers, or rolling before a later move. preview an option to see its effect on your XI. you can also try your own transfer or lock players you want to keep.

imports use your last published deadline squad and bank, with one free transfer by default. check your balances in **Edit team details** and confirm selling prices when previewing a move. saved plans stay yours until you choose **Refresh from FPL**. Free Hit squads need correcting before comparison.

scores are heuristics, not predicted FPL points. there’s no backtested accuracy claim. see the [model assumptions](docs/model.md).

## verification

```sh
npm run typecheck
npm run lint
npm run format:check
npm test
npx playwright install chromium firefox webkit
npm run test:e2e
npm run build
```

Playwright starts a server on port 3100. to use an existing server:

```sh
PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:e2e
```

CI tests a production build across Chromium desktop/mobile, Firefox and WebKit mobile. browser tests use fixtures; check live FPL separately before release. [deployment guide](docs/deployment.md).

## code structure

| where                                                   | what belongs there                                 |
| ------------------------------------------------------- | -------------------------------------------------- |
| `src/app/`                                              | routes, layout and global styles                   |
| `src/features/planner/planner.tsx`                      | screen composition                                 |
| `src/features/planner/use-planner.ts`                   | session state and actions                          |
| `src/features/planner/api.ts`, `settings.ts`            | HTTP validation, imports and saved settings        |
| `src/features/planner/selection.ts`, `components/`      | preview state, rendering and local interactions    |
| `src/lib/model.ts`, `model/`                            | pure scoring, squad rules and planning             |
| `src/lib/fpl.ts`, `schemas.ts`                          | server-side FPL access, caching and data contracts |
| `src/lib/evaluation.ts`, `scripts/evaluate-snapshot.ts` | frozen decisions and offline outcome evaluation    |

keep fetching and persistence out of presentation components, and browser code out of the model. preserve public model exports and version-1 saved settings. [AGENTS.md](AGENTS.md) has the iteration rules.

## a bit more

- [API findings](docs/api-investigation.md): what public FPL data can and can’t tell us.
- [evaluation](docs/evaluation.md): score existing snapshots after matches finish. there’s no snapshot download in the UI.
- [Pancake UI](https://github.com/j4ckwinter/pancake-ui): shared components, installed from npm as `@jack.winter/pancake-ui`.

`unrs-resolver` is pinned to 1.11.1 because the advertised 1.13.0 tarball returned 404 during setup. replace it once an upgrade is verified. other dependency follow-ups live in the [release guide](docs/deployment.md#dependency-and-source-release-status).

## license

Fantasy Pancake is proprietary. keep this repository private; see [LICENSE](LICENSE). `private: true` prevents npm publication, not public GitHub access.

Pancake UI remains [MIT licensed](https://github.com/j4ckwinter/pancake-ui/blob/main/LICENSE). Inter fonts retain their SIL Open Font License; other dependencies keep their own licenses.
