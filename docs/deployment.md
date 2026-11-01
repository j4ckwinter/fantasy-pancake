# Deployment and release checks

## Runtime and build

Use the exact Node version in `.nvmrc` locally and in CI. `package.json` permits that version or a newer Node 22 patch for managed hosting. The current pin is [Node 22.23.4 LTS](https://nodejs.org/en/blog/release/v22.23.4), a security release. Review the pin and engine range together when upgrading, then repeat verification.

The application needs a Node server for its API routes. Vercel is the deployment target, using its Next.js integration and Node 22 runtime. The API routes need outbound HTTPS to `fantasy.premierleague.com`. A static file host alone cannot run the application. No API keys, account credentials or application secrets are required.

From a clean checkout (Pancake UI installs from npm through the lockfile):

```sh
nvm install
nvm use
npm ci
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run start -- --hostname 0.0.0.0 --port 3000
```

Use the host's assigned port instead of 3000 when required. Keep the built `.next` directory, `public`, package files and installed dependencies together on the same runtime/OS used to build them. Install development dependencies during the build; do not run `npm ci --omit=dev` before building. Run the service under the host's process supervisor and place it behind an HTTPS reverse proxy. Do not expose the development server as the deployment.

No database or migration is needed. Settings stay in browser local storage, scoped to the site's origin. Changing the domain will not carry saved settings across. Server FPL data caches last five minutes per process; multiple instances have independent caches and upstream traffic.

## Vercel

Import the private `j4ckwinter/fantasy-pancake` GitHub repository with the Next.js preset, repository root directory, `npm ci` install command and `npm run build` build command. No application environment variables are required. Vercel manages Node 22 patch versions; `.nvmrc` pins local and GitHub CI runs only.

Use `main` for production and pull-request branches for previews. Check the GitHub Verify run before merging; private-repository required-check enforcement is unavailable on the current GitHub plan. Vercel Git deployments run independently of GitHub Actions. Roll back through Vercel’s deployment history if the live checks fail.

## Verification and live smoke

The Verify workflow runs a clean install, types, lint, formatting, unit tests, production dependency audit and build, then Chromium desktop/mobile, Firefox desktop and WebKit mobile Playwright projects against `next start`. API fixtures make those browser tests repeatable; they do not check live upstream data.

For a local production build, start the server as above and run in a second terminal:

```sh
npx playwright install chromium firefox webkit
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:e2e
```

Before promoting a release, test the actual host with live FPL data:

1. Open `/` on desktop and mobile. Confirm fonts, styling and scripts load without browser errors.
2. Request `/api/data`; expect HTTP 200 and JSON containing bootstrap data and fixtures. Check that the displayed gameweeks match the current season. An empty future horizon at season end is valid.
3. Import a known public numeric FPL team ID in the UI. Verify the squad matches its published deadline picks, adjust bank and free transfers, and open recommendations. A Free Hit import should ask for correction.
4. Open a player's details to exercise `/api/history/{id}`. Inspect any API errors and retry behavior. History may be unavailable even when bootstrap works; recommendations then fall back to season estimates.
5. Reload and confirm saved settings restore. Record the release revision, host, time and result without publishing a user's team ID or downloaded data in CI logs.

These checks need a published deadline squad and usable current-season data. If FPL is unavailable or between seasons, record the limitation; mocked tests are not a substitute for this check.

## Health and rollback

Use HTTP GET `/` as a lightweight process/readiness probe. It establishes that the page can be served, not that FPL is healthy. Check `/api/data` separately at low frequency for upstream availability and valid JSON; avoid probing each player's history or importing teams as a frequent health check. Monitor response failures, latency, process restarts and upstream error rates. Do not restart all instances merely because FPL is down.

Keep the previous verified revision and its matching build/dependencies available. Promote only after readiness and live smoke checks. If a release breaks page loading, imports or recommendations, route traffic back to the previous release or redeploy that revision with its own lockfile and pinned runtime. Recheck page readiness and the affected flow after rollback. There are no database migrations to reverse; do not clear browser storage as part of rollback.

## Dependency and source-release status

On 2026-10-31, `npm audit --omit=dev` reported no vulnerabilities. The full audit reported 16 moderate findings propagated from [minimatch glob amplification](https://github.com/advisories/GHSA-g3hv-75wg-m249) through the lint tooling. Installed minimatch 3.1.5 and 10.2.6 are the latest versions in their respective major lines at review time; the advisory requires 11.0.1 or later. A global cross-major override is not an established compatible fix. npm proposes downgrading ESLint to 4.0.0 and eslint-config-next to 12.0.4, which is unsuitable for this application. Leave the existing tree intact until a compatible upstream fix is verified. Run lint only on trusted project inputs and recheck the full audit before each release. CI gates production advisories; this documented development-tool finding remains open.

Fantasy Pancake is proprietary software owned by Jack Winter; keep its repository private and deploy the application without publishing its source repository. The root LICENSE reserves rights to the application code and documentation. The `@jack.winter/pancake-ui` dependency remains MIT licensed. Its npm package includes `LICENSE` and the Inter font notice at `dist/fonts/OFL.txt`; preserve these notices with distributions. See the root application license and dependency license files. Repeat the live-host smoke checks above after deployment.
