# FPL Transfer Planner

## Goal

Build a web app that helps me make better FPL transfers. Recommend a small shortlist based on my team, explain the trade-offs, and treat saving a transfer as a valid option.

A good transfer improves my starting XI over the next few gameweeks enough to justify its cost and lost flexibility.

## Phase 1: Explore the API

Before implementing, make real requests to the FPL API and inspect the responses.

- Identify endpoints for players, fixtures, squad import and player history.
- Explore player statistics beyond total points and form: expected goals, expected assists, minutes, starts, creativity, defensive contributions and set-piece duties.
- Confirm which fields actually exist. Distinguish season totals, per-match history and recent performance.
- Suggest a small, justified set of statistics for predicting future points. Account for position, minutes and small samples.
- Check what is public versus authenticated, particularly current squads, selling prices, bank balance and free transfers.
- Identify information users must supply and values the recommendation model must estimate.
- Check whether historical data supports evaluating past recommendations without using information available only afterwards.
- Check server-side access and response headers. Propose sensible caching without assuming undocumented rate limits.
- Summarise findings, useful fields, limitations and necessary changes to this brief.

**Complete this investigation first and present the findings before implementing the app.**

Potential endpoints to investigate:

- `/bootstrap-static/`
- `/fixtures/`
- `/element-summary/{player_id}/`
- `/entry/{team_id}/event/{gameweek}/picks/`

## Tech stack

- Next.js, React and TypeScript.
- [Pancake UI](https://github.com/j4ckwinter/pancake-ui) for components and styling.
- Pancake Stack for the development workflow.
- Server routes for FPL requests, with caching and Zod validation.
- Local storage for team settings initially; no accounts or database.
- Vitest for recommendation logic and Playwright for the main user journey.
- Linting and formatting

## First version

### 1. Import and confirm my team

- Enter an FPL team ID and import the latest available gameweek squad.
- Clearly show which gameweek the squad came from.
- Let me correct the squad and confirm bank balance, selling prices and free transfers.
- Explain that public picks may not reflect transfers made since the last deadline.

### 2. Evaluate transfers

- Support single-player transfers initially.
- Compare each move against keeping my squad and saving the transfer.
- Assess the next four gameweeks, showing the immediate gameweek separately.
- Consider expected minutes, availability, underlying performance, player role and fixtures.
- Measure improvement to my starting XI, accounting for valid formations and captaincy.
- Enforce budget, position and club limits using current FPL rules.
- Deduct any transfer hit and explain the value of retaining flexibility.
- Flag uncertain minutes, missing information and small samples.
- Use a transparent TypeScript model with documented assumptions; no LLM required.
- Label outputs honestly: a heuristic score must not be presented as projected FPL points.

### 3. Show recommendations

Display up to three worthwhile transfers alongside the option to roll.

For each move, show:

- Player out and player in.
- Cost, any points hit and remaining budget.
- Projected net points gain—or a clearly labelled score improvement.
- Upcoming fixtures.
- Why the move helps.
- Main risks and uncertainty.
- How it compares with doing nothing.

If no move offers a convincing improvement, recommend rolling. Explain the threshold used.

## Interface

- Clean, responsive layout using Pancake UI.
- One main journey: **import team → confirm details → view recommendations**.
- Make reasoning easy to scan.
- Show when data was fetched.
- Include loading, empty and error states.

## Out of scope

- FPL login or automatic transfers.
- Multi-transfer combinations and chip planning.
- Live match tracking, mini-leagues and social features.
- AI chat, paid data feeds and complex infrastructure.

## Success criteria

- I can import and correct my team, then get recommendations.
- Every suggested transfer is legal and affordable using my confirmed settings.
- Recommendations account for hits and compare against rolling.
- Identical inputs and data produce identical results.
- I can understand why a move is recommended and where it is uncertain.
- Tests cover transfer legality, hit deductions, starting-XI impact and cases where rolling is preferable.

## Development approach

Build the smallest working end-to-end version. Keep API access separate from recommendation logic.

Prioritise correct calculations and clear reasoning over extra features. Document the model’s limitations. A working interface does not prove the recommendations are good: evaluate them against simple baselines when suitable historical data is available.