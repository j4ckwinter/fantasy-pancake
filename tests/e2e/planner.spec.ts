import { test, expect, type Page } from "@playwright/test";
import type { Data, Player } from "../../src/lib/schemas";

async function openCustomComparison(page: Page) {
  if (!(await page.getByLabel("Player to sell").isVisible())) {
    await page.locator("#planner-compare > summary").click();
  }
}

async function chooseIncoming(page: Page, name: string) {
  await page.getByRole("combobox", { name: "Player to buy" }).fill(name);
  await page.getByRole("option", { name: new RegExp(name) }).click();
}

async function replaceSquadPlayer(
  page: Page,
  outgoing: string,
  incoming: string,
) {
  await page
    .getByRole("button", { name: `Replace ${outgoing}`, exact: true })
    .click();
  await page
    .getByRole("combobox", { name: `Replacement for ${outgoing}`, exact: true })
    .fill(incoming);
  await page.getByRole("option", { name: new RegExp(incoming) }).click();
}

function fixtureData(): Data {
  const elements: Player[] = [
    1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 3,
  ].map((position, i) => ({
    id: i + 1,
    web_name: i === 15 ? "New Star" : `Player ${i + 1}`,
    team: Math.floor(i / 3) + 1,
    element_type: position,
    now_cost: 50,
    status: "a",
    news: "",
    can_select: true,
    can_transact: true,
    chance_of_playing_next_round: null,
    minutes: 720,
    starts: 8,
    expected_goals: i === 15 ? 12 : 1,
    expected_assists: 1,
    expected_goals_conceded: 10,
    defensive_contribution: 40,
    saves: 10,
    creativity: 10,
    penalties_order: null,
    corners_and_indirect_freekicks_order: null,
    direct_freekicks_order: null,
  }));
  return {
    fetchedAt: "2026-10-31T18:00:00Z",
    bootstrap: {
      elements,
      teams: Array.from({ length: 20 }, (_, i) => ({
        id: i + 1,
        name: `Team ${i + 1}`,
        short_name: `T${i + 1}`,
      })),
      events: Array.from({ length: 12 }, (_, i) => ({
        id: i + 1,
        name: `Gameweek ${i + 1}`,
        deadline_time: "2026-10-31T12:00:00Z",
        finished: i < 8,
        is_current: i === 7,
        is_next: i === 8,
      })),
      element_types: [
        {
          id: 1,
          singular_name_short: "GKP",
          squad_select: 2,
          squad_min_play: 1,
          squad_max_play: 1,
        },
        {
          id: 2,
          singular_name_short: "DEF",
          squad_select: 5,
          squad_min_play: 3,
          squad_max_play: 5,
        },
        {
          id: 3,
          singular_name_short: "MID",
          squad_select: 5,
          squad_min_play: 2,
          squad_max_play: 5,
        },
        {
          id: 4,
          singular_name_short: "FWD",
          squad_select: 3,
          squad_min_play: 1,
          squad_max_play: 3,
        },
      ],
      game_settings: {
        squad_squadsize: 15,
        squad_squadplay: 11,
        squad_team_limit: 3,
        max_extra_free_transfers: 4,
      },
    },
    fixtures: Array.from({ length: 12 }, (_, w) =>
      Array.from({ length: 6 }, (_, i) => ({
        id: w * 6 + i,
        event: w + 1,
        team_h: i + 1,
        team_a: i + 11,
        team_h_difficulty: 3,
        team_a_difficulty: 3,
        finished: w < 8,
        kickoff_time: "2026-10-31T12:00:00Z",
      })),
    ).flat(),
  };
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/history/*", (route) =>
    route.fulfill({ json: { history: [] } }),
  );
  await page.route("**/api/data", (route) =>
    route.fulfill({ json: fixtureData() }),
  );
  await page.route("**/api/import?*", (route) =>
    route.fulfill({
      json: {
        active_chip: null,
        entry_history: { event: 8, bank: 5 },
        picks: Array.from({ length: 15 }, (_, i) => ({ element: i + 1 })),
        fetchedAt: "2026-10-31T18:00:00Z",
      },
    }),
  );
});
test("keyboard import releases the input before replacing the form", async ({
  page,
}) => {
  await page.goto("/");
  const input = page.getByLabel("FPL team ID");
  await input.fill("123");
  await input.evaluate((element) => {
    element.addEventListener("blur", () => {
      document.documentElement.dataset.importBlurConnected = String(
        element.isConnected,
      );
    });
  });
  await input.press("Enter");
  const heading = page.getByRole("heading", {
    name: "Your transfer shortlist",
    exact: true,
  });
  await expect(heading).toBeFocused();
  await expect(page.locator("html")).toHaveAttribute(
    "data-import-blur-connected",
    "true",
  );
  await expect
    .poll(() =>
      page
        .locator(".workspace-heading")
        .evaluate((element) => element.getBoundingClientRect().top),
    )
    .toBeGreaterThanOrEqual(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(
    page.getByRole("link", { name: "Fantasy Pancake home" }),
  ).toBeInViewport();
});

test("import, correct, confirm, compare and restore settings", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.goto("/");
  await page.getByLabel("FPL team ID").fill("123");
  await page.getByRole("button", { name: "Import team" }).click();
  await page.getByRole("button", { name: "Edit team details" }).click();
  await expect(page.getByText("Team #123 · GW8 picks")).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Replace Player 8", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Edit team", exact: true }).click();
  await replaceSquadPlayer(page, "Player 8", "New Star");
  await replaceSquadPlayer(page, "New Star", "Player 8");
  await page.getByLabel("Bank balance (£m)").fill("0.4");
  await page.getByLabel("Free transfers remaining").selectOption("0");
  await page
    .getByRole("button", { name: /^(Save & view shortlist|View shortlist)/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your transfer shortlist", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByText("Roll the transfer", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("New Star", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Heuristic score improvements", { exact: false }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: /Preview Player .* to New Star/ })
    .first()
    .click();
  await expect(
    page.locator(".transfer-alternative .alternative-hit").first(),
  ).toHaveText("−4 hit");
  const summary = page.locator(".lineup-preview__summary");
  await expect(summary.getByText("4 pts", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Clear preview", exact: true }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Before", exact: true }).click();
  await expect(page.getByLabel("Baseline starting lineup")).toBeVisible();
  await expect(
    page.getByLabel("Baseline starting lineup").locator(".pitch-board__player"),
  ).toHaveCount(11);
  await page
    .getByRole("button", { name: "Show lineup GW10", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Show lineup GW10", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Baseline starting lineup")).toContainText(
    "GW10 · Baseline, before a transfer",
  );
  await page
    .getByRole("button", { name: "Show lineup GW9", exact: true })
    .click();
  await expect(page.locator(".fixture-strip").first()).toContainText("GW9");
  await expect(page.locator(".fixture-strip").first()).toContainText("T16 (H)");
  await page.locator("#selected-option > summary").click();
  await page
    .getByText("Why this option · risks and assumptions", { exact: true })
    .click();
  await expect(
    page.getByRole("article", { name: "Selected transfer option" }),
  ).toContainText("season averages can miss recent changes");
  await page.screenshot({
    path: `test-results/journey-${test.info().project.name}.png`,
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Edit team details" }).click();
  await expect(page.getByLabel("Bank balance (£m)")).toHaveValue("0.4");
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page
    .getByRole("button", { name: /^(Save & view shortlist|View shortlist)/ })
    .click();
  await expect(page.locator(".transfer-price-note")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
test("displays import errors and allows retry", async ({ page }) => {
  await page.route("**/api/import?*", (route) =>
    route.fulfill({
      status: 404,
      json: {
        error: "No published FPL data was found for that team or gameweek.",
      },
    }),
  );
  await page.goto("/");
  await page.getByLabel("FPL team ID").fill("999");
  await page.getByRole("button", { name: "Import team" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Something needs attention" }),
  ).toContainText("No published FPL data");
  await expect(page.getByRole("button", { name: "Import team" })).toBeEnabled();
});
test("empty horizon and invalid stored settings are safe", async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("fpl-planner-v1", '{"version":99}'),
  );
  const data = fixtureData();
  data.bootstrap.events.forEach((e) => {
    e.is_next = false;
    e.is_current = false;
    e.finished = true;
  });
  await page.route("**/api/data", (route) => route.fulfill({ json: data }));
  await page.goto("/");
  await expect(
    page.getByText(
      "Saved settings are outdated or invalid. Import your team again.",
    ),
  ).toBeVisible();
  await page.getByLabel("FPL team ID").fill("123");
  await page.getByRole("button", { name: "Import team" }).click();
  await expect(page.getByText("The horizon is empty")).toBeVisible();
});

test("a confirmed over-limit squad only gets corrective transfers", async ({
  page,
}) => {
  const data = fixtureData();
  data.bootstrap.elements[7].team = 1;
  await page.route("**/api/data", (route) => route.fulfill({ json: data }));
  await page.goto("/");
  await page.getByLabel("FPL team ID").fill("123");
  await page.getByRole("button", { name: "Import team" }).click();
  await expect(page.getByText("Check this club-limit exception")).toBeVisible();
  await expect(page.locator(".transfer-group")).toHaveCount(1);
  await expect(page.locator(".transfer-group").first()).toContainText(
    "Player 8",
  );
  await expect(page.locator(".transfer-group").first()).toContainText(
    "New Star",
  );
});

test("selling-price confirmation removes unaffordable moves", async ({
  page,
}) => {
  const data = fixtureData();
  data.bootstrap.elements[7].team = 1;
  await page.route("**/api/data", (route) => route.fulfill({ json: data }));
  await page.goto("/");
  await page.getByLabel("FPL team ID").fill("123");
  await page.getByRole("button", { name: "Import team" }).click();
  await page.getByRole("button", { name: "Edit team details" }).click();
  await page.getByLabel("Bank balance (£m)").fill("0");
  await page
    .getByRole("button", { name: /^(Save & view shortlist|View shortlist)/ })
    .click();
  await expect(page.locator(".transfer-group")).toHaveCount(1);
  await expect(page.locator(".transfer-group")).not.toContainText(
    "Selling prices are estimates unless checked",
  );
  await page
    .getByRole("button", { name: "Preview Player 8 to New Star" })
    .click();
  await page.locator("#selected-option > summary").click();
  await page.getByText("Check selling prices", { exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm price", exact: true })
    .click();
  await expect(page.locator(".transfer-group")).toContainText("Price checked");
  await page.getByLabel("Selling price for Player 8 (£m)").fill("4.9");
  await page
    .getByRole("button", { name: "Confirm price", exact: true })
    .click();
  await expect(page.locator(".transfer-group")).toHaveCount(0);
  await page.getByLabel("Selling price for Player 8 (£m)").fill("5");
  await page
    .getByRole("button", { name: "Confirm price", exact: true })
    .click();
  await expect(page.locator(".transfer-group")).toHaveCount(1);
  await expect(page.locator(".transfer-group")).toContainText("Price checked");
  await expect(
    page.getByRole("status").filter({ hasText: "Selling price confirmed" }),
  ).toBeVisible();
});

test("import controls align without overflow", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Fantasy Pancake");
  await expect(
    page.getByRole("link", { name: "Fantasy Pancake home" }),
  ).toBeVisible();
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    "/fantasy-pancake.svg",
  );
  await expect(page.locator(".brand-mark")).toHaveJSProperty(
    "naturalWidth",
    64,
  );
  const input = page.getByLabel("FPL team ID");
  const button = page.getByRole("button", { name: "Import team" });
  await expect(input).toBeVisible();
  await expect(
    page.getByText("How to read the model", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".import-id-example strong")).toHaveText("123456");
  await expect(
    page.getByText("Where’s my team ID?", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("footer")).toContainText("Public FPL data");
  await expect(page.locator("footer")).not.toContainText("Data fetched");
  await expect(page.locator(".landing-steps li")).toHaveCount(3);
  if (test.info().project.use.isMobile) {
    const pitch = await page.locator(".hero > .pitch-board").boundingBox();
    expect(pitch!.height).toBeLessThan(300);
  }
  const fieldBox = (await input.boundingBox())!;
  const buttonBox = (await button.boundingBox())!;
  if (page.viewportSize()!.width > 1150) {
    expect(
      Math.abs(fieldBox.y + fieldBox.height - buttonBox.y - buttonBox.height),
    ).toBeLessThan(2);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/import-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test("recent histories and availability scenario are connected", async ({
  page,
}) => {
  const data = fixtureData();
  data.bootstrap.events.forEach((event) => {
    event.deadline_time = "2030-11-01T12:00:00Z";
  });
  data.bootstrap.elements[7].status = "i";
  data.bootstrap.elements[7].expected_goals = 5;
  await page.route("**/api/data", (route) => route.fulfill({ json: data }));
  await page.route("**/api/history/*", (route) => {
    const id = Number(route.request().url().split("/").at(-1));
    const player = data.bootstrap.elements.find((player) => player.id === id)!;
    return route.fulfill({
      json: {
        history: [6, 7, 8].map((round) => ({
          fixture: (round - 1) * 6 + player.team - 1,
          round,
          minutes: 90,
          starts: 1,
          expected_goals: id === 16 ? 2 : 0.1,
          expected_assists: 0.1,
          expected_goals_conceded: 1,
          defensive_contribution: 8,
          total_points: 4,
          kickoff_time: "2026-10-30T12:00:00Z",
        })),
      },
    });
  });
  await page.goto("/");
  await page.getByLabel("FPL team ID").fill("123");
  await page.getByRole("button", { name: "Import team" }).click();
  await page.getByRole("button", { name: "Edit team details" }).click();
  await page.getByText("Advanced options", { exact: true }).click();
  await page
    .getByLabel("Availability assumption")
    .selectOption("recover-next-week");
  await page
    .getByRole("button", { name: /^(Save & view shortlist|View shortlist)/ })
    .click();
  await page
    .locator(".transfer-group")
    .getByRole("button", { name: "New Star", exact: true })
    .click();
  await expect(page.getByRole("dialog").locator("tbody tr")).toHaveCount(3);
  await expect(
    page.getByRole("dialog").locator("tbody tr").first(),
  ).toContainText("90");
  await page.keyboard.press("Escape");
  await openCustomComparison(page);
  await page.getByLabel("Player to sell").selectOption("8");
  await chooseIncoming(page, "New Star");
  await page.getByRole("button", { name: "Compare my transfer" }).click();
  await page.locator("#selected-option > summary").click();
  await page
    .getByText("Why this option · risks and assumptions", { exact: true })
    .click();
  await expect(
    page.getByText("Availability scenarios:", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Roll then move", exact: true })
    .click();
  await expect(page.locator(".transfer-plan")).toContainText("Roll, then move");
  await expect(
    page.getByRole("button", { name: "Download evaluation snapshot" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Evaluate this decision later", { exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: `test-results/forecasts-${test.info().project.name}.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Edit team details" }).click();
  await expect(page.getByLabel("Availability assumption")).toHaveValue(
    "recover-next-week",
  );
});

test("history failures fall back without blocking comparisons", async ({
  page,
}) => {
  await page.route("**/api/history/*", (route) =>
    route.fulfill({ status: 503, json: { error: "Unavailable" } }),
  );
  await page.goto("/");
  await page.getByLabel("FPL team ID").fill("123");
  await page.getByRole("button", { name: "Import team" }).click();
  await expect(
    page.getByRole("heading", { name: "Your transfer shortlist", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".transfer-group")).toHaveCount(1);
  await page
    .getByRole("button", { name: /Preview Player .* to New Star/ })
    .first()
    .click();
  await expect(page.getByLabel("Preview starting lineup")).toBeVisible();
});

test("editing inputs during history loading cannot publish stale results", async ({
  page,
}) => {
  await page.route("**/api/history/*", (route) =>
    route.fulfill({ status: 503, json: { error: "Unavailable" } }),
  );
  await page.goto("/");
  await page.getByLabel("FPL team ID").fill("123");
  await page.getByRole("button", { name: "Import team" }).click();
  await page.getByRole("button", { name: "Edit team details" }).click();
  await page.getByLabel("Bank balance (£m)").fill("0.6");
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/history/*", async (route) => {
    await gate;
    await route.fulfill({ json: { history: [] } });
  });
  await page
    .getByRole("button", { name: /^(Save & view shortlist|View shortlist)/ })
    .click();
  await expect(
    page.getByRole("button", {
      name: /^(Save & view shortlist|View shortlist)/,
    }),
  ).toBeDisabled();
  await page.getByLabel("Bank balance (£m)").fill("1.2");
  release();
  await expect(
    page.getByRole("button", {
      name: /^(Save & view shortlist|View shortlist)/,
    }),
  ).toBeEnabled();
  await expect(
    page.getByRole("heading", { name: "Your team", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /^(Save & view shortlist|View shortlist)/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your transfer shortlist", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".workspace-figures")).toContainText("£1.2m");
});

test("pair plans show combined transfers and correct hits", async ({
  page,
}) => {
  const data = fixtureData();
  data.bootstrap.elements.push({
    ...data.bootstrap.elements[15],
    id: 17,
    web_name: "New Defender",
    element_type: 2,
    expected_goals: 10,
  });
  await page.route("**/api/data", (route) => route.fulfill({ json: data }));
  await page.goto("/");
  await page.getByLabel("FPL team ID").fill("123");
  await page.getByRole("button", { name: "Import team" }).click();
  await page.getByRole("button", { name: "Edit team details" }).click();
  await page.getByLabel("Free transfers remaining").selectOption("2");
  await page
    .getByRole("button", { name: /^(Save & view shortlist|View shortlist)/ })
    .click();
  await page
    .getByRole("button", { name: "Two transfers", exact: true })
    .click();
  const pair = page
    .locator(".transfer-plan")
    .filter({ hasText: "Two transfers now" });
  await expect(pair).toBeVisible();
  await expect(pair.locator("ol li")).toHaveCount(2);
  await expect(pair).toContainText("No hit");
  await expect(pair).not.toContainText("Provisional");
  await page.getByRole("button", { name: "Edit team details" }).click();
  await page.getByLabel("Free transfers remaining").selectOption("0");
  await page
    .getByRole("button", { name: /^(Save & view shortlist|View shortlist)/ })
    .click();
  await page
    .getByRole("button", { name: "Two transfers", exact: true })
    .click();
  await expect(pair).toContainText("8 pts");
  if (test.info().project.use.isMobile) {
    const preview = await pair
      .getByRole("button", { name: "Preview plan" })
      .boundingBox();
    const nav = await page
      .getByRole("navigation", { name: "Planner sections" })
      .boundingBox();
    expect(preview!.y + preview!.height).toBeLessThanOrEqual(nav!.y);
  }

  await expect(page.locator(".roll-option")).toHaveCount(0);
  await page.screenshot({
    path: `test-results/plan-cards-${test.info().project.name}.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("groups incoming options and preserves player locks across reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("FPL team ID").fill("123");
  await page.getByRole("button", { name: "Import team" }).click();
  await expect(page.locator(".transfer-group")).toHaveCount(1);
  await expect(
    page.locator(".transfer-group .transfer-alternative"),
  ).toHaveCount(3);
  const preview = page
    .getByRole("button", { name: /Preview Player .* to New Star/ })
    .first();
  const label = await preview.getAttribute("aria-label");
  const player = label!.replace("Preview ", "").replace(" to New Star", "");
  await page.getByText("Keep players · 0 locked", { exact: true }).click();
  await page
    .getByRole("button", { name: `Keep ${player}`, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: `Unlock ${player}`, exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: label!, exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .getByLabel("Player to sell")
      .getByRole("option", { name: new RegExp(`${player} · .* · kept$`) }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Roll then move", exact: true })
    .click();
  await expect(page.locator(".transfer-plan ol")).not.toContainText(player);
  await page.reload();
  await page.getByText("Keep players · 1 locked", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: `Unlock ${player}`, exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: label!, exact: true }),
  ).toHaveCount(0);
});

test("custom comparisons preview below-threshold moves without changing the squad", async ({
  page,
}) => {
  const data = fixtureData();
  data.bootstrap.events.forEach((event) => {
    event.deadline_time = "2030-11-01T12:00:00Z";
  });
  data.bootstrap.elements.push({
    ...data.bootstrap.elements[7],
    id: 17,
    team: 6,
    web_name: "Steady Midfielder",
  });
  await page.route("**/api/data", (route) => route.fulfill({ json: data }));
  await page.goto("/");
  await page.getByLabel("FPL team ID").fill("123");
  await page.getByRole("button", { name: "Import team" }).click();
  await openCustomComparison(page);
  await page.getByLabel("Player to sell").selectOption("8");
  await chooseIncoming(page, "Steady Midfielder");
  await page.getByRole("button", { name: "Compare my transfer" }).click();
  await page.locator("#selected-option > summary").click();
  const selected = page.getByRole("article", {
    name: "Selected transfer option",
  });
  await expect(selected).toContainText("Steady Midfielder");
  await expect(selected).toContainText("Below shortlist threshold");
  const feedback = page.locator(".custom-comparison-result");
  await expect(feedback.getByRole("link")).toHaveCount(1);
  await expect(feedback).toContainText("Below the shortlist threshold");
  await page.locator("#selected-option > summary").click();
  await expect(page.locator("#selected-option")).not.toHaveAttribute(
    "open",
    "",
  );
  await feedback.getByRole("link", { name: "View comparison details" }).click();
  await expect(page.locator("#selected-option")).toHaveAttribute("open", "");
  await expect(page.locator("#selected-option > summary")).toBeFocused();
  await selected
    .getByText("Gameweek-by-gameweek gains", { exact: true })
    .click();
  await expect(selected.locator(".weekly-breakdown tbody tr")).toHaveCount(4);
  await expect(selected.locator(".weekly-breakdown")).toContainText(
    "Transfer hit · deducted once",
  );
  await selected
    .getByText("Compare players · minutes and attacking threat", {
      exact: true,
    })
    .click();
  const stats = selected.getByRole("table", {
    name: "Playing time and attacking threat",
  });
  await expect(stats).toBeVisible();
  await expect(
    stats.getByRole("columnheader", { name: /Outgoing.*Player 8/ }),
  ).toBeVisible();
  await expect(
    stats.getByRole("columnheader", { name: /Incoming.*Steady Midfielder/ }),
  ).toBeVisible();
  await expect(
    stats.getByRole("rowheader", { name: /Expected minutes/ }),
  ).toBeVisible();
  await expect(
    stats.getByRole("rowheader", { name: /Expected goals/ }),
  ).toBeVisible();
  await expect(
    stats.getByRole("rowheader", { name: /Expected assists/ }),
  ).toBeVisible();
  const context = selected.locator(".player-comparison__context");
  await expect(context).not.toHaveAttribute("open", "");
  await context
    .getByText("Recent usage and forecast context", { exact: true })
    .click();
  await expect(context).toHaveAttribute("open", "");
  await expect(context).toContainText("season estimates used");
  await context
    .getByText("Recent usage and forecast context", { exact: true })
    .click();
  await page.screenshot({
    path: `test-results/comparison-details-${test.info().project.name}.png`,
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  if (test.info().project.use.isMobile) {
    await expect(
      page.getByRole("navigation", { name: "Planner sections" }),
    ).toBeInViewport();
    await page
      .getByRole("navigation", { name: "Planner sections" })
      .getByRole("link", { name: "Compare", exact: true })
      .click();
    await expect(page.getByLabel("Player to sell")).toBeInViewport();
  }
  await page.getByRole("combobox", { name: "Player to buy" }).fill("New Star");
  await expect(feedback).toHaveCount(0);
  await expect(page.getByLabel("Preview starting lineup")).toBeVisible();
  await expect(
    page.getByLabel("Preview starting lineup").locator(".pitch-board__player"),
  ).toHaveCount(11);
  await page.getByRole("button", { name: "Before", exact: true }).click();
  await expect(page.getByLabel("Baseline starting lineup")).toContainText(
    "Player 8",
  );
  await expect(page.getByLabel("Baseline starting lineup")).not.toContainText(
    "Steady Midfielder",
  );
  await page.getByRole("button", { name: "Edit team details" }).click();
  await page.getByRole("button", { name: "Edit team", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Replace Player 8", exact: true }),
  ).toBeVisible();
});

test("pitch players open details and Escape returns keyboard focus", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("FPL team ID").fill("123");
  await page.getByRole("button", { name: "Import team" }).click();
  const player = page
    .getByLabel("Baseline starting lineup")
    .getByRole("button", { name: /View .* details/ })
    .first();
  await player.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(
    "No eligible completed history is available",
  );
  await expect(dialog).toContainText("Percentages are model assumptions");
  await expect(dialog.locator(".fixture-strip__week")).toHaveCount(4);
  await expect(
    dialog.getByRole("button", { name: "Close player details" }),
  ).toBeFocused();
  await page.screenshot({
    path: `test-results/player-details-${test.info().project.name}.png`,
    animations: "disabled",
  });
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await dialog
    .getByText("What this forecast cannot know", { exact: true })
    .click();
  await dialog
    .getByText("Recent appearances do not establish", { exact: false })
    .scrollIntoViewIfNeeded();
  await expect(
    dialog.getByRole("button", { name: "Close player details" }),
  ).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(player).toBeFocused();
});

test("delayed plans preserve the first-week XI and only change later weeks", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("FPL team ID").fill("123");
  await page.getByRole("button", { name: "Import team" }).click();
  await expect(
    page.getByLabel("Baseline starting lineup").locator(".pitch-board__name"),
  ).toHaveCount(11);
  const before = await page
    .getByLabel("Baseline starting lineup")
    .locator(".pitch-board__name")
    .allTextContents();
  await page
    .getByRole("button", { name: "Roll then move", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Preview plan", exact: true })
    .first()
    .click();
  const after = page.getByLabel("Preview starting lineup");
  await expect(after).toBeVisible();
  expect(await after.locator(".pitch-board__name").allTextContents()).toEqual(
    before,
  );
  await expect(after).not.toContainText("New Star");
  await page
    .getByRole("button", { name: "Show lineup GW10", exact: true })
    .click();
  await expect(after).toContainText("New Star");
  await expect(after.locator(".pitch-board__player--entered")).toHaveCount(1);
  await page.getByRole("button", { name: "Before", exact: true }).click();
  await expect(page.getByLabel("Baseline starting lineup")).not.toContainText(
    "New Star",
  );
});

test("clearing the preview cancels an in-flight custom comparison", async ({
  page,
}) => {
  await page.route("**/api/history/*", (route) =>
    route.fulfill({ status: 503, json: { error: "Unavailable" } }),
  );
  await page.goto("/");
  await page.getByLabel("FPL team ID").fill("123");
  await page.getByRole("button", { name: "Import team" }).click();
  await expect(page.getByLabel("Baseline starting lineup")).toBeVisible();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/history/*", async (route) => {
    await gate;
    await route.fulfill({ json: { history: [] } });
  });
  await openCustomComparison(page);
  await page.getByLabel("Player to sell").selectOption("8");
  await chooseIncoming(page, "New Star");
  await page.getByRole("button", { name: "Compare my transfer" }).click();
  await expect(
    page.getByRole("button", { name: "Comparing…", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Clear preview", exact: true })
    .click();
  release();
  await expect(
    page.getByRole("button", { name: "Compare my transfer", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("article", { name: "Selected transfer option" }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Baseline starting lineup")).toBeVisible();
  await expect(page.getByLabel("Preview starting lineup")).toHaveCount(0);
});

test("preview preserves desktop position and takes mobile users to the new XI", async ({
  page,
}) => {
  const data = fixtureData();
  data.bootstrap.elements.push(
    {
      ...data.bootstrap.elements[15],
      id: 17,
      web_name: "Alternative One",
      team: 6,
    },
    {
      ...data.bootstrap.elements[15],
      id: 18,
      web_name: "Alternative Two",
      team: 6,
    },
  );
  await page.route("**/api/data", (route) => route.fulfill({ json: data }));
  await page.goto("/");
  await page.getByLabel("FPL team ID").fill("123");
  await page.getByRole("button", { name: "Import team" }).click();
  await expect(page.locator(".transfer-group")).toHaveCount(3);
  const choices = page.getByRole("button", {
    name: /Preview Player .* to New Star/,
  });
  const first = choices.first();
  await first.scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await first.click();
  await expect(page.getByLabel("Preview starting lineup")).toBeVisible();
  if (!test.info().project.use.isMobile) {
    await expect(first).toBeFocused();
    expect(
      Math.abs((await page.evaluate(() => window.scrollY)) - scrollBefore),
    ).toBeLessThan(3);
    await page.mouse.move(400, 350);
    await page.mouse.wheel(0, 350);
    await expect
      .poll(async () => {
        const box = await page
          .getByLabel("Preview starting lineup")
          .boundingBox();
        return box!.y + box!.height;
      })
      .toBeLessThanOrEqual(page.viewportSize()!.height);
    const pitch = await page
      .getByLabel("Preview starting lineup")
      .boundingBox();
    expect(pitch!.y).toBeGreaterThanOrEqual(0);
    expect(pitch!.y + pitch!.height).toBeLessThanOrEqual(
      page.viewportSize()!.height,
    );
  } else {
    await expect(page.locator("#lineup-comparison")).toBeFocused();
    await expect(
      page
        .getByRole("navigation", { name: "Planner sections" })
        .getByRole("link", { name: "Squad", exact: true }),
    ).toHaveAttribute("aria-current", "location");
    await expect(
      page.getByRole("link", { name: "Back to options" }),
    ).toBeInViewport();
    await expect(page.locator(".lineup-preview__selection")).toContainText(
      "Your FPL team is unchanged",
    );
    await expect(
      page.getByRole("button", { name: "After", exact: true }),
    ).toBeInViewport();
  }
  await page.getByRole("button", { name: "Before", exact: true }).click();
  if (test.info().project.use.isMobile) {
    await page.getByRole("link", { name: "Back to options" }).click();
    await expect(first).toBeFocused();
    expect(
      Math.abs((await page.evaluate(() => window.scrollY)) - scrollBefore),
    ).toBeLessThan(3);
    await expect(
      page
        .getByRole("navigation", { name: "Planner sections" })
        .getByRole("link", { name: "Options", exact: true }),
    ).toHaveAttribute("aria-current", "location");
  }
  await choices.nth(1).click();
  await expect(
    page.getByRole("button", { name: "After", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Preview starting lineup")).toContainText(
    "New Star",
  );
  await page.screenshot({
    path: `test-results/preview-position-${test.info().project.name}.png`,
    animations: "disabled",
  });
});

test("custom errors follow the submitted players and weekly gains deduct the hit once", async ({
  page,
}) => {
  const data = fixtureData();
  data.bootstrap.elements.push({
    ...data.bootstrap.elements[15],
    id: 17,
    web_name: "Expensive Midfielder",
    now_cost: 100,
  });
  await page.route("**/api/data", (route) => route.fulfill({ json: data }));
  await page.goto("/");
  await page.getByLabel("FPL team ID").fill("123");
  await page.getByRole("button", { name: "Import team" }).click();
  await page.getByRole("button", { name: "Edit team details" }).click();
  await page.getByLabel("Free transfers remaining").selectOption("0");
  await page
    .getByRole("button", { name: /^(Save & view shortlist|View shortlist)/ })
    .click();
  await openCustomComparison(page);
  await page.getByLabel("Player to sell").selectOption("8");
  await chooseIncoming(page, "Expensive Midfielder");
  await page.getByRole("button", { name: "Compare my transfer" }).click();
  await expect(page.locator(".custom-transfer-error")).toContainText(
    "unaffordable",
  );
  await chooseIncoming(page, "New Star");
  await expect(page.locator(".custom-transfer-error")).toHaveCount(0);
  await page.getByRole("button", { name: "Compare my transfer" }).click();
  await expect(
    page.locator(".lineup-preview__summary .metric").nth(1),
  ).toContainText("4 pts");
  await page.locator("#selected-option > summary").click();
  const selected = page.getByRole("article", {
    name: "Selected transfer option",
  });
  await selected
    .getByText("Gameweek-by-gameweek gains", { exact: true })
    .click();
  const totals = await selected
    .locator(".weekly-breakdown__totals dd")
    .allTextContents();
  const [gross, hit, net] = totals.map((value) =>
    Number(value.replace("−", "-")),
  );
  expect(hit).toBe(-4);
  expect(Math.abs(gross + hit - net)).toBeLessThan(0.11);
  await selected.getByText("Check selling prices", { exact: true }).click();
  await page.getByLabel("Selling price for Player 8 (£m)").fill("0");
  await page
    .getByRole("button", { name: "Confirm price", exact: true })
    .click();
  await expect(selected.getByRole("alert")).toContainText("unaffordable");
});

test("results keep optional tools collapsed and the first recommendation easy to reach", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("FPL team ID").fill("123");
  await page.getByRole("button", { name: "Import team" }).click();
  await expect(
    page.getByRole("heading", { name: "Your transfer shortlist", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".steps")).toHaveCount(0);
  await expect(
    page.getByRole("group", { name: "Before or after transfers" }),
  ).toHaveCount(0);
  await expect(
    page.locator(".transfer-group").first().locator(".transfer-price-note"),
  ).toHaveCount(0);
  await expect(page.locator(".alternative-gain").first()).toContainText(
    "Score gain · GW9–12",
  );
  if (test.info().project.use.isMobile) {
    const row = await page
      .locator(".transfer-alternative")
      .first()
      .boundingBox();
    expect(row!.height).toBeLessThan(150);
  }
  await expect(page.locator(".alternative-hit")).toHaveCount(0);
  const difficulty = page
    .locator(".transfer-group .fixture-strip__difficulty")
    .first();
  await expect(difficulty).toBeVisible();
  await expect(difficulty).toHaveText("Difficulty 3");

  await expect(page.getByLabel("Player to sell")).not.toBeVisible();
  await expect(
    page.getByText("How to read the model", { exact: true }),
  ).toHaveCount(0);
  const firstPreview = await page
    .getByRole("button", { name: /Preview Player .* to New Star/ })
    .first()
    .boundingBox();
  const nav = test.info().project.use.isMobile
    ? await page
        .getByRole("navigation", { name: "Planner sections" })
        .boundingBox()
    : null;
  expect(firstPreview!.y + firstPreview!.height).toBeLessThanOrEqual(
    nav?.y ?? page.viewportSize()!.height,
  );
  await page.screenshot({
    path: `test-results/compact-results-${test.info().project.name}.png`,
    fullPage: true,
    animations: "disabled",
  });
  if (test.info().project.use.isMobile) {
    await page
      .getByRole("navigation", { name: "Planner sections" })
      .getByRole("link", { name: "Compare", exact: true })
      .click();
  } else {
    await page.locator("#planner-compare > summary").click();
  }
  await expect(page.getByLabel("Player to sell")).toBeVisible();
  await page.getByLabel("Player to sell").selectOption("8");
  await page.locator("#planner-compare > summary").click();
  await expect(page.getByLabel("Player to sell")).not.toBeVisible();
  await page.locator("#planner-compare > summary").click();
  await expect(page.getByLabel("Player to sell")).toHaveValue("8");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("normal import opens recommendations directly and keeps assumptions editable", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("FPL team ID").fill("123");
  await page.getByRole("button", { name: "Import team" }).click();
  await expect(
    page.getByRole("heading", { name: "Your transfer shortlist", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /^(Save & view shortlist|View shortlist)/,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Confirm the details", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".workspace-figures")).toContainText("£0.5m");
  await expect(
    page.locator(".workspace-figures").getByText("1", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".transfer-group")).toHaveCount(1);
  await expect(
    page.getByLabel("Baseline starting lineup").locator(".pitch-board__player"),
  ).toHaveCount(11);
  await expect(
    page.getByText("How these comparisons work", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".results-support")).toHaveCount(0);
  await page
    .getByRole("heading", { name: "Your transfer shortlist", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `test-results/workspace-overview-${test.info().project.name}.png`,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Edit team details" }).click();
  await expect(page.locator(".squad-editor")).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: /^(Save & view shortlist|View shortlist)/,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/team-settings-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.getByLabel("Bank balance (£m)").fill("1.2");
  await page.getByLabel("Free transfers remaining").selectOption("2");
  await page
    .getByRole("button", { name: /^(Save & view shortlist|View shortlist)/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your transfer shortlist", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".workspace-figures")).toContainText("£1.2m");
  await expect(
    page.locator(".workspace-figures").getByText("2", { exact: true }),
  ).toBeVisible();
});

test("Free Hit imports require permanent-squad correction before recommending", async ({
  page,
}) => {
  await page.route("**/api/import?*", (route) =>
    route.fulfill({
      json: {
        active_chip: "freehit",
        entry_history: { event: 8, bank: 5 },
        picks: Array.from({ length: 15 }, (_, i) => ({ element: i + 1 })),
        fetchedAt: "2026-10-31T18:00:00Z",
      },
    }),
  );
  await page.goto("/");
  await page.getByLabel("FPL team ID").fill("123");
  await page.getByRole("button", { name: "Import team" }).click();
  await expect(
    page.getByText("This is a Free Hit squad.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Replace Player 8", exact: true }),
  ).toBeVisible();
  const freeHitNotice = await page
    .getByText("This is a Free Hit squad.", { exact: false })
    .boundingBox();
  const players = await page.locator(".squad-editor").boundingBox();
  expect(freeHitNotice!.y + freeHitNotice!.height).toBeLessThan(players!.y);
  await expect(
    page.getByRole("heading", { name: "Your transfer shortlist", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: /^(Save & view shortlist|View shortlist)/,
    }),
  ).toBeVisible();
});

test("the XI panel uses the page scroll rather than a nested scrollbar", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("FPL team ID").fill("123");
  await page.getByRole("button", { name: "Import team" }).click();
  const squad = page.locator(".workspace-squad");
  await expect(squad).toBeVisible();
  const scrollStyles = await squad.evaluate((element) => ({
    overflowY: getComputedStyle(element).overflowY,
    maxHeight: getComputedStyle(element).maxHeight,
  }));
  expect(scrollStyles).toEqual({ overflowY: "visible", maxHeight: "none" });
  await page
    .getByRole("button", { name: /Preview Player .* to New Star/ })
    .first()
    .click();
  await expect(
    page.getByLabel("Preview starting lineup").locator(".pitch-board__player"),
  ).toHaveCount(11);
  await page.getByText("Bench and XI changes", { exact: true }).click();
  await expect(page.locator(".lineup-preview__bench")).toBeVisible();
  await page.getByText("Keep players · 0 locked", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Keep Player 15", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Keep Player 15", exact: true })
    .scrollIntoViewIfNeeded();
  expect(await squad.evaluate((element) => element.scrollTop)).toBe(0);
  await page.screenshot({
    path: `test-results/direct-import-${test.info().project.name}.png`,
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("returning starters distinguish expected minutes from recent starting minutes", async ({
  page,
}) => {
  const data = fixtureData();
  data.bootstrap.elements[7].minutes = 319;
  data.bootstrap.elements[7].starts = 4;
  await page.route("**/api/data", (route) => route.fulfill({ json: data }));
  await page.route("**/api/history/8", (route) =>
    route.fulfill({
      json: {
        history: [0, 0, 0, 27, 71, 85, 71, 65].map((minutes, index) => ({
          fixture: index * 6 + 2,
          round: index + 1,
          minutes,
          starts: index >= 4 ? 1 : 0,
          expected_goals: 0.1,
          expected_assists: 0.1,
          expected_goals_conceded: 1,
          defensive_contribution: 1,
          total_points: 2,
          kickoff_time: `2026-10-${String(index + 1).padStart(2, "0")}T12:00:00Z`,
        })),
      },
    }),
  );
  await page.goto("/");
  await page.getByLabel("FPL team ID").fill("123");
  await page.getByRole("button", { name: "Import team" }).click();
  await expect(
    page.getByRole("heading", { name: "Your transfer shortlist", exact: true }),
  ).toBeVisible();
  await page.getByText("Bench and XI changes", { exact: true }).click();
  await page
    .getByRole("complementary", { name: "Lineup comparison" })
    .getByRole("button", { name: /^(View Player 8 details|Player 8)$/ })
    .click();
  const dialog = page.getByRole("dialog");
  const expected = dialog
    .locator(".player-details__metrics > div")
    .filter({ hasText: "Expected minutes / match" });
  await dialog
    .getByText("Playing time and forecast context", { exact: true })
    .click();
  const starting = dialog
    .locator(".player-details__supporting-metrics > div")
    .filter({ hasText: "Minutes when starting · recent" });
  expect(Number(await expected.locator("dd").innerText())).toBeGreaterThan(60);
  expect(Number(await expected.locator("dd").innerText())).toBeLessThan(73);
  await expect(starting.locator("dd")).toHaveText("73");
  await expect(dialog).toContainText(
    "Four consecutive starts give the recent role extra weight",
  );
  await expect(dialog).toContainText(
    "4 starts in the latest four completed matches",
  );
  await page.screenshot({
    path: `test-results/adaptive-minutes-${test.info().project.name}.png`,
    animations: "disabled",
  });
});

test("incoming picker requires a choice and supports keyboard search", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("FPL team ID").fill("123");
  await page.getByRole("button", { name: "Import team" }).click();
  await openCustomComparison(page);
  await expect(page.getByLabel("Player to sell")).toHaveValue("");
  await expect(
    page.getByRole("combobox", { name: "Player to buy" }),
  ).toBeDisabled();
  await expect(
    page.getByLabel("Player to sell").locator("optgroup"),
  ).toHaveCount(4);
  await page.getByLabel("Player to sell").selectOption("8");
  const picker = page.getByRole("combobox", { name: "Player to buy" });
  const compare = page.getByRole("button", { name: "Compare my transfer" });
  await expect(compare).toBeDisabled();
  await picker.fill("no such player");
  await expect(page.getByRole("status")).toContainText("No matching players");
  await expect(compare).toBeDisabled();
  await picker.fill("New Star");
  await expect(
    page.getByRole("option", { name: /New Star.*T6.*£5.0m/ }),
  ).toBeVisible();
  await expect(compare).toBeDisabled();
  await page.screenshot({
    path: `test-results/player-picker-${test.info().project.name}.png`,
    animations: "disabled",
  });
  if (test.info().project.use.isMobile) {
    await expect(
      page.getByRole("navigation", { name: "Planner sections" }),
    ).toBeHidden();
    const popup = await page.locator(".player-picker__popup").boundingBox();
    const submit = await compare.boundingBox();
    expect(submit!.y).toBeGreaterThanOrEqual(popup!.y + popup!.height);
  }
  await picker.press("ArrowDown");
  await picker.press("Enter");
  await expect(picker).toHaveValue("New Star · T6 · £5.0m");
  await expect(compare).toBeEnabled();
  await picker.click();
  expect(
    await picker.evaluate(
      (input: HTMLInputElement) => input.selectionEnd! - input.selectionStart!,
    ),
  ).toBe("New Star · T6 · £5.0m".length);
  await picker.press("Escape");
  await expect(picker).toHaveAttribute("aria-expanded", "false");
  await expect(compare).toBeEnabled();
  await page.getByLabel("Player to sell").selectOption("9");
  await expect(picker).toHaveValue("");
  await expect(compare).toBeDisabled();
});

test("loading panel follows real requests and respects reduced motion", async ({
  page,
}) => {
  let releaseData!: () => void;
  const waitingForData = new Promise<void>((resolve) => {
    releaseData = resolve;
  });
  await page.route("**/api/data", async (route) => {
    await waitingForData;
    await route.fulfill({ json: fixtureData() });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const loading = page.locator(".planner-loading");
  await expect(loading).toHaveAttribute("role", "status");
  await expect(loading).toContainText("Loading players and fixtures");
  expect(
    await page
      .locator(".planner-loading__track span")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await page.screenshot({
    path: `test-results/loading-${test.info().project.name}.png`,
    fullPage: true,
  });
  releaseData();
  await expect(loading).toHaveCount(0);
  await expect(page.getByLabel("FPL team ID")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("mobile navigation reaches each section and opens comparison", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("FPL team ID").fill("123");
  await page.getByRole("button", { name: "Import team" }).click();
  await expect(page.locator(".transfer-group")).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Planner sections" });
  if (!test.info().project.use.isMobile) {
    await expect(nav).toBeHidden();
    return;
  }
  await expect(nav).toBeInViewport();
  for (const [name, id] of [
    ["Squad", "planner-squad"],
    ["Compare", "planner-compare"],
    ["Options", "planner-options"],
  ]) {
    const link = nav.getByRole("link", { name, exact: true });
    const box = await link.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await link.click();
    await expect(page.locator(`#${id}`)).toBeInViewport();
    await expect(link).toHaveAttribute("aria-current", "location");
    await expect(nav.locator('[aria-current="location"]')).toHaveCount(1);
    if (name === "Compare")
      await expect(page.getByLabel("Player to sell")).toBeVisible();
  }
  await page
    .locator("#planner-squad")
    .evaluate((element) => element.scrollIntoView({ block: "start" }));
  await expect(
    nav.getByRole("link", { name: "Squad", exact: true }),
  ).toHaveAttribute("aria-current", "location");
  await page.screenshot({
    path: `test-results/mobile-navigation-${test.info().project.name}.png`,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("preview buttons toggle singles and plans back to the current XI", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("FPL team ID").fill("123");
  await page.getByRole("button", { name: "Import team" }).click();
  const single = page
    .getByRole("button", { name: /Preview Player .* to New Star/ })
    .first();
  await single.click();
  await expect(single).toHaveText("Selected");
  await expect(single).toHaveAttribute("aria-pressed", "true");
  const pitchBox = await page
    .getByLabel("Preview starting lineup")
    .boundingBox();
  const summaryBox = await page
    .locator(".lineup-preview__summary")
    .boundingBox();
  const detailsBox = await page.locator("#selected-option").boundingBox();
  expect(summaryBox!.y).toBeGreaterThanOrEqual(pitchBox!.y + pitchBox!.height);
  expect(detailsBox!.y).toBeGreaterThanOrEqual(
    summaryBox!.y + summaryBox!.height,
  );
  await expect(
    page.getByText("THE EFFECT ON YOUR XI", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("#selected-option")).toBeVisible();
  await page.screenshot({
    path: `test-results/preview-toggle-${test.info().project.name}.png`,
    animations: "disabled",
  });
  await single.click();
  await expect(single).toHaveText("Preview");
  await expect(single).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#selected-option")).toHaveCount(0);
  await expect(
    page.getByRole("group", { name: "Before or after transfers" }),
  ).toHaveCount(0);
  await expect(page.locator(".lineup-preview__selection")).toHaveCount(0);
  await expect(page.getByLabel("Baseline starting lineup")).toBeVisible();
  await page
    .getByRole("button", { name: "Roll then move", exact: true })
    .click();
  const plan = page.locator(".transfer-plan .preview-toggle").first();
  await plan.click();
  await expect(plan).toHaveText("Selected");
  await plan.click();
  await expect(plan).toHaveText("Preview plan");
  await expect(page.locator("#selected-option")).toHaveCount(0);
  await expect(page.locator(".lineup-preview__selection")).toHaveCount(0);
  await expect(page.getByLabel("Baseline starting lineup")).toBeVisible();
});

test("changing plan category clears the preview", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("FPL team ID").fill("123");
  await page.getByRole("button", { name: "Import team" }).click();
  const choice = page
    .getByRole("button", { name: /Preview Player .* to New Star/ })
    .first();
  await choice.click();
  await page.getByRole("button", { name: "Singles", exact: true }).click();
  await expect(choice).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Roll then move", exact: true })
    .click();
  await expect(page.locator("#selected-option")).toHaveCount(0);
  await expect(page.locator(".lineup-preview__selection")).toHaveCount(0);
  await expect(page.getByLabel("Baseline starting lineup")).toBeVisible();
  await page.locator(".transfer-plan .preview-toggle").first().click();
  if (test.info().project.use.isMobile) {
    await page.getByRole("link", { name: "Back to options" }).click();
    await expect(
      page.locator(".transfer-plan .preview-toggle").first(),
    ).toBeFocused();
  }
  await page
    .getByRole("button", { name: "Two transfers", exact: true })
    .click();
  await expect(page.locator("#selected-option")).toHaveCount(0);
  await expect(
    page.getByRole("group", { name: "Before or after transfers" }),
  ).toHaveCount(0);
});

test("team editing can return or discard without recalculating or saving drafts", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("FPL team ID").fill("123");
  await page.getByRole("button", { name: "Import team" }).click();
  await page
    .getByRole("button", { name: /Preview Player .* to New Star/ })
    .first()
    .click();
  await expect(
    page.locator('.preview-toggle[aria-pressed="true"]'),
  ).toHaveCount(1);
  let historyRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/history/")) historyRequests++;
  });
  await page.getByRole("button", { name: "Edit team details" }).click();
  await page.getByRole("button", { name: "View shortlist" }).click();
  await expect(
    page.getByRole("heading", { name: "Your transfer shortlist", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('.preview-toggle[aria-pressed="true"]'),
  ).toHaveCount(1);
  expect(historyRequests).toBe(0);
  await page.getByRole("button", { name: "Edit team details" }).click();
  await page.getByLabel("Bank balance (£m)").fill("1.2");
  await page.getByLabel("Free transfers remaining").selectOption("2");
  await page.getByRole("button", { name: "Edit team", exact: true }).click();
  await replaceSquadPlayer(page, "Player 8", "New Star");
  await page.getByRole("button", { name: "Discard changes" }).click();
  await expect(page.locator(".workspace-figures")).toContainText("£0.5m");
  await expect(
    page.locator('.preview-toggle[aria-pressed="true"]'),
  ).toHaveCount(1);
  expect(historyRequests).toBe(0);
  await page.getByRole("button", { name: "Edit team details" }).click();
  await expect(page.getByLabel("Free transfers remaining")).toHaveValue("1");
  await page.getByRole("button", { name: "Edit team", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Replace Player 8", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Edit team details" }).click();
  await expect(page.getByLabel("Bank balance (£m)")).toHaveValue("0.5");
});

test("team updates clear import guidance and keep the expanded action reachable", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("FPL team ID").fill("123");
  await page.getByRole("button", { name: "Import team" }).click();
  await page.getByRole("button", { name: "Edit team details" }).click();
  await page.getByRole("button", { name: "Edit team", exact: true }).click();
  await page
    .getByRole("button", { name: "Replace Player 8", exact: true })
    .scrollIntoViewIfNeeded();
  const action = await page
    .getByRole("button", { name: /^(Save & view shortlist|View shortlist)/ })
    .boundingBox();
  expect(action).not.toBeNull();
  expect(action!.y).toBeGreaterThanOrEqual(0);
  expect(action!.y + action!.height).toBeLessThanOrEqual(
    page.viewportSize()!.height,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/team-expanded-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Hide players" }).click();
  await expect(page.locator(".squad-editor")).toHaveCount(0);
  await page.getByLabel("Free transfers remaining").selectOption("2");
  await page
    .getByRole("button", { name: /^(Save & view shortlist|View shortlist)/ })
    .click();
  await page.getByRole("button", { name: "Edit team details" }).click();
  await expect(page.getByLabel("Free transfers remaining")).toHaveValue("2");
  await expect(
    page.getByText("Free transfers default to 1", { exact: false }),
  ).toHaveCount(0);
});

test("returning from team editing preserves the plan category and selected plan", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("FPL team ID").fill("123");
  await page.getByRole("button", { name: "Import team" }).click();
  await page
    .getByRole("button", { name: "Roll then move", exact: true })
    .click();
  await page.locator(".transfer-plan .preview-toggle").first().click();
  await page.getByRole("button", { name: "Edit team details" }).click();
  await page.getByRole("button", { name: "View shortlist" }).click();
  await expect(
    page.getByRole("button", { name: "Roll then move", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.locator('.transfer-plan .preview-toggle[aria-pressed="true"]'),
  ).toHaveCount(1);
});

test("squad replacement supports keyboard search, cancellation and touch selection", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByLabel("FPL team ID").fill("123");
  await page.getByRole("button", { name: "Import team" }).click();
  await page.getByRole("button", { name: "Edit team details" }).click();
  await expect(page.getByLabel("Availability assumption")).not.toBeVisible();
  await page.getByRole("button", { name: "Edit team", exact: true }).click();
  const replace = page.getByRole("button", {
    name: "Replace Player 8",
    exact: true,
  });
  await replace.click();
  const search = page.getByRole("combobox", {
    name: "Replacement for Player 8",
    exact: true,
  });
  await expect(search).toBeFocused();
  await search.fill("Player 9");
  await expect(
    page.getByRole("listbox", { name: "Matching players" }).getByRole("option"),
  ).toHaveCount(0);
  await search.press("Escape");
  await expect(replace).toBeFocused();
  await expect(search).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Discard changes" }),
  ).toHaveCount(0);
  await replace.click();
  await search.fill("New Star");
  await page.screenshot({
    path: `test-results/team-replacement-${testInfo.project.name}.png`,
    animations: "disabled",
  });
  if (testInfo.project.use.isMobile) {
    await page.getByRole("option", { name: /New Star/ }).tap();
  } else {
    await search.press("Enter");
  }
  await expect(
    page.getByRole("button", { name: "Replace New Star", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Save & view shortlist" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save & view shortlist" }).click();
  await page.getByRole("button", { name: "Edit team details" }).click();
  await page.getByRole("button", { name: "Edit team", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Replace New Star", exact: true }),
  ).toBeVisible();
});

test("team names appear in both headings and survive saved sessions", async ({
  page,
}) => {
  await page.route("**/api/import?*", (route) =>
    route.fulfill({
      json: {
        teamName: "The Pancake XI",
        active_chip: null,
        entry_history: { event: 8, bank: 5 },
        picks: Array.from({ length: 15 }, (_, i) => ({ element: i + 1 })),
        fetchedAt: "2026-10-31T18:00:00Z",
      },
    }),
  );
  await page.goto("/");
  await page.getByLabel("FPL team ID").fill("123");
  await page.getByRole("button", { name: "Import team" }).click();
  await expect(page.locator(".workspace-heading .eyebrow")).toContainText(
    "The Pancake XI",
  );
  await page.getByRole("button", { name: "Edit team details" }).click();
  await expect(page.locator(".team-settings-header")).toContainText(
    "The Pancake XI",
  );
  await page.getByLabel("Bank balance (£m)").fill("1.2");
  await page.getByRole("button", { name: "Save & view shortlist" }).click();
  await page.reload();
  await expect(page.locator(".workspace-heading .eyebrow")).toContainText(
    "The Pancake XI",
  );
  await expect(page.locator(".workspace-figures")).toContainText("£1.2m");
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("fpl-planner-v1")!);
    delete saved.teamName;
    localStorage.setItem("fpl-planner-v1", JSON.stringify(saved));
  });
  await page.reload();
  await expect(page.locator(".workspace-heading .eyebrow")).toContainText(
    "The Pancake XI",
  );
  await expect(page.locator(".workspace-figures")).toContainText("£1.2m");
  await page.route("**/api/import?*", (route) =>
    route.fulfill({ status: 503, json: { error: "Unavailable" } }),
  );
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("fpl-planner-v1")!);
    delete saved.teamName;
    localStorage.setItem("fpl-planner-v1", JSON.stringify(saved));
  });
  await page.reload();
  await expect(page.locator(".workspace-heading .eyebrow")).toContainText(
    "Team #123",
  );
  await expect(page.locator(".workspace-figures")).toContainText("£1.2m");
});

test("shortlist and saved-plan controls fit a 320px viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  await page.getByLabel("FPL team ID").fill("123");
  await page.getByRole("button", { name: "Import team" }).click();
  for (const name of ["Singles", "Two transfers", "Roll then move"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBe(320);
  }
  await page.reload();
  await expect(
    page.getByRole("complementary", { name: "Saved plan" }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBe(320);
});

test("saved plans remain intact until an explicit successful FPL refresh", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("FPL team ID").fill("123");
  await page.getByRole("button", { name: "Import team" }).click();
  await page.getByRole("button", { name: "Edit team details" }).click();
  await page.getByLabel("Bank balance (£m)").fill("1.2");
  await page.getByLabel("Free transfers remaining").selectOption("3");
  await page.getByRole("button", { name: "Save & view shortlist" }).click();
  await page.reload();
  const savedPlan = page.getByRole("complementary", { name: "Saved plan" });
  await expect(savedPlan).toContainText("Saved plan · GW8 picks");
  await expect(page.locator(".workspace-figures")).toContainText("£1.2m");
  const original = await page.evaluate(() =>
    localStorage.getItem("fpl-planner-v1"),
  );
  await page.route("**/api/import?*", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "FPL temporarily unavailable" },
    }),
  );
  await savedPlan.getByRole("button", { name: "Refresh from FPL" }).click();
  await expect(
    page.getByText("FPL temporarily unavailable", { exact: true }),
  ).toBeVisible();
  await expect(savedPlan).toBeVisible();
  await expect(page.locator(".workspace-figures")).toContainText("£1.2m");
  expect(
    await page.evaluate(() => localStorage.getItem("fpl-planner-v1")),
  ).toBe(original);
  await page.route("**/api/import?*", (route) =>
    route.fulfill({
      json: {
        active_chip: null,
        entry_history: { event: 9, bank: 8 },
        picks: Array.from({ length: 15 }, (_, i) => ({
          element: i === 7 ? 999 : i + 1,
        })),
        fetchedAt: "2026-10-31T18:00:00Z",
      },
    }),
  );
  await savedPlan.getByRole("button", { name: "Refresh from FPL" }).click();
  await expect(page.getByText(/Player 999 is no longer/)).toBeVisible();
  await expect(savedPlan).toContainText("Saved plan · GW8 picks");
  expect(
    await page.evaluate(() => localStorage.getItem("fpl-planner-v1")),
  ).toBe(original);
  await page.route("**/api/import?*", (route) =>
    route.fulfill({
      json: {
        teamName: "Refreshed XI",
        active_chip: null,
        entry_history: { event: 9, bank: 8 },
        picks: Array.from({ length: 15 }, (_, i) => ({
          element: i === 7 ? 16 : i + 1,
        })),
        fetchedAt: "2026-10-31T18:00:00Z",
      },
    }),
  );
  await savedPlan.getByRole("button", { name: "Refresh from FPL" }).click();
  await expect(savedPlan).toHaveCount(0);
  await expect(page.locator(".workspace-heading .eyebrow")).toContainText(
    "Refreshed XI",
  );
  await expect(page.locator(".workspace-figures")).toContainText("£0.8m");
  const refreshed = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("fpl-planner-v1")!),
  );
  expect(refreshed.sourceGameweek).toBe(9);
  expect(refreshed.freeTransfers).toBe(1);
  expect(refreshed.squad.map((pick: { id: number }) => pick.id)).toContain(16);
  expect(refreshed.squad.map((pick: { id: number }) => pick.id)).not.toContain(
    8,
  );
});

test("expired planning data and histories refresh on focus without replacing the squad", async ({
  page,
}) => {
  const start = new Date("2026-10-31T18:00:00Z");
  await page.clock.setFixedTime(start);
  let dataRequests = 0;
  let historyRequests = 0;
  let refreshed = false;
  await page.route("**/api/data", (route) => {
    dataRequests++;
    const data = fixtureData();
    if (refreshed) {
      data.bootstrap.events.forEach((event) => {
        event.is_current = event.id === 9;
        event.is_next = event.id === 10;
        event.finished = event.id < 9;
      });
      data.bootstrap.elements[7].now_cost = 55;
      data.bootstrap.elements[8].now_cost = 54;
    }
    return route.fulfill({ json: data });
  });
  await page.route("**/api/history/*", (route) => {
    historyRequests++;
    return route.fulfill({ json: { history: [] } });
  });
  await page.goto("/");
  await page.getByLabel("FPL team ID").fill("123");
  await page.getByRole("button", { name: "Import team" }).click();
  await expect(page.locator(".workspace-horizon")).toHaveText("GW9–12");
  await page
    .getByRole("button", { name: "Preview Player 8 to New Star" })
    .click();
  await page.locator("#selected-option > summary").click();
  await page.getByText("Check selling prices", { exact: true }).click();
  await page.getByLabel("Selling price for Player 8 (£m)").fill("4.9");
  await page
    .getByRole("button", { name: "Confirm price", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Selling price confirmed" }),
  ).toBeVisible();
  const historyCount = historyRequests;
  const initialDataRequests = dataRequests;
  refreshed = true;
  await page.clock.setFixedTime(new Date(start.getTime() + 6 * 60_000));
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator(".workspace-horizon")).toHaveText("GW10–12");
  expect(dataRequests).toBe(initialDataRequests + 1);
  expect(historyRequests).toBeGreaterThan(historyCount);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("fpl-planner-v1")!),
  );
  expect(saved.bank).toBe(5);
  expect(
    saved.squad.find((pick: { id: number }) => pick.id === 8).sellingPrice,
  ).toBe(49);
  expect(
    saved.squad.find((pick: { id: number }) => pick.id === 9).sellingPrice,
  ).toBe(54);
  expect(saved.squad.map((pick: { id: number }) => pick.id)).toEqual(
    Array.from({ length: 15 }, (_, i) => i + 1),
  );
});

test("expired data refresh waits for edited settings and failures can be retried", async ({
  page,
}) => {
  const start = new Date("2026-10-31T18:00:00Z");
  await page.clock.setFixedTime(start);
  let dataRequests = 0;
  let failRefresh = false;
  await page.route("**/api/data", (route) => {
    dataRequests++;
    return failRefresh
      ? route.fulfill({ status: 503, json: { error: "Refresh unavailable" } })
      : route.fulfill({ json: fixtureData() });
  });
  await page.goto("/");
  await page.getByLabel("FPL team ID").fill("123");
  await page.getByRole("button", { name: "Import team" }).click();
  await page.getByRole("button", { name: "Edit team details" }).click();
  await page.getByLabel("Bank balance (£m)").fill("1.2");
  const initialDataRequests = dataRequests;
  await page.clock.setFixedTime(new Date(start.getTime() + 6 * 60_000));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByLabel("Bank balance (£m)")).toHaveValue("1.2");
  expect(dataRequests).toBe(initialDataRequests);
  failRefresh = true;
  await page.getByRole("button", { name: "Save & view shortlist" }).click();
  await expect(
    page.getByText("Refresh unavailable", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Bank balance (£m)")).toHaveValue("1.2");
  failRefresh = false;
  await page.getByRole("button", { name: "Save & view shortlist" }).click();
  await expect(
    page.getByRole("heading", { name: "Your transfer shortlist", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".workspace-figures")).toContainText("£1.2m");
  expect(dataRequests).toBe(initialDataRequests + 2);
});

test("failed focus refresh does not save subsequent team edits on focus", async ({
  page,
}) => {
  const start = new Date("2026-10-31T18:00:00Z");
  await page.clock.setFixedTime(start);
  let failRefresh = false;
  let dataRequests = 0;
  await page.route("**/api/data", (route) => {
    dataRequests++;
    return failRefresh
      ? route.fulfill({ status: 503, json: { error: "Refresh unavailable" } })
      : route.fulfill({ json: fixtureData() });
  });
  await page.goto("/");
  await page.getByLabel("FPL team ID").fill("123");
  await page.getByRole("button", { name: "Import team" }).click();
  await expect(
    page.getByRole("heading", { name: "Your transfer shortlist", exact: true }),
  ).toBeVisible();
  const saved = await page.evaluate(() =>
    localStorage.getItem("fpl-planner-v1"),
  );
  failRefresh = true;
  await page.clock.setFixedTime(new Date(start.getTime() + 6 * 60_000));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByText("Refresh unavailable", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Bank balance (£m)").fill("1.2");
  failRefresh = false;
  const requestsBeforeFocus = dataRequests;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByLabel("Bank balance (£m)")).toHaveValue("1.2");
  expect(dataRequests).toBe(requestsBeforeFocus);
  expect(
    await page.evaluate(() => localStorage.getItem("fpl-planner-v1")),
  ).toBe(saved);
  await page.getByRole("button", { name: "Save & view shortlist" }).click();
  await expect(page.locator(".workspace-figures")).toContainText("£1.2m");
});

test("an invalid initial imported squad opens correction instead of losing the import", async ({
  page,
}) => {
  await page.route("**/api/import?*", (route) =>
    route.fulfill({
      json: {
        teamName: "Needs correction",
        active_chip: null,
        entry_history: { event: 8, bank: 5 },
        picks: Array.from({ length: 15 }, (_, i) => ({
          element: i === 7 ? 999 : i + 1,
        })),
        fetchedAt: "2026-10-31T18:00:00Z",
      },
    }),
  );
  await page.goto("/");
  await page.getByLabel("FPL team ID").fill("123");
  await page.getByRole("button", { name: "Import team" }).click();
  await expect(
    page.getByRole("heading", { name: "Your team", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".team-settings-header")).toContainText(
    "Needs correction",
  );
  await expect(page.getByLabel("Bank balance (£m)")).toHaveValue("0.5");
  await expect(
    page.getByRole("heading", { name: "Your transfer shortlist", exact: true }),
  ).toHaveCount(0);
});

test("previewing an expired option refreshes the shortlist before using the move", async ({
  page,
}) => {
  const start = new Date("2026-10-31T18:00:00Z");
  await page.clock.setFixedTime(start);
  let dataRequests = 0;
  await page.route("**/api/data", (route) => {
    dataRequests++;
    const data = fixtureData();
    data.bootstrap.elements.push({
      ...data.bootstrap.elements[15],
      id: 17,
      web_name: "New Defender",
      element_type: 2,
      expected_goals: 10,
    });
    return route.fulfill({ json: data });
  });
  await page.goto("/");
  await page.getByLabel("FPL team ID").fill("123");
  await page.getByRole("button", { name: "Import team" }).click();
  await expect(page.locator(".workspace-horizon")).toBeVisible();
  const initialRequests = dataRequests;
  for (const [index, category] of ["Singles", "Two transfers"].entries()) {
    await page.getByRole("button", { name: category, exact: true }).click();
    await page.clock.setFixedTime(
      new Date(start.getTime() + (index + 1) * 6 * 60_000),
    );
    await page.locator(".preview-toggle").first().click();
    await expect(page.locator(".workspace-horizon")).toBeVisible();
    await expect.poll(() => dataRequests).toBe(initialRequests + index + 1);
    await expect(
      page.getByRole("button", { name: "Singles", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.locator(".preview-toggle[aria-pressed=true]"),
    ).toHaveCount(0);
  }
});
