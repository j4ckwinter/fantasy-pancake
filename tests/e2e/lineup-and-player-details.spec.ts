import type { Locator, Page } from "@playwright/test";
import {
  expect,
  fixtureData,
  NEW_STAR_INDEX,
  routeData,
  test,
  withPlayer,
} from "./support/fixtures";
import {
  bottomOf,
  compareTransfer,
  confirmTeamDetails,
  expectNoHorizontalOverflow,
  heightOf,
  importTeam,
  saveAndViewShortlist,
  scrollY,
  shortlistHeading,
  topOf,
} from "./support/planner";

async function routeRecentFormWithInjuredPlayer8(page: Page) {
  const data = fixtureData();
  data.bootstrap.events.forEach((event) => {
    event.deadline_time = "2030-11-01T12:00:00Z";
  });
  data.bootstrap.elements[7].status = "i";
  data.bootstrap.elements[7].expected_goals = 5;
  await routeData(page, data);
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
}

async function chooseRecoveryNextWeek(page: Page) {
  await page.getByRole("button", { name: "Edit team details" }).click();
  await page.getByText("Advanced options", { exact: true }).click();
  await page
    .getByLabel("Availability assumption")
    .selectOption("recover-next-week");
  await saveAndViewShortlist(page);
}

test("player details list recent completed matches", async ({ page }) => {
  await routeRecentFormWithInjuredPlayer8(page);
  await importTeam(page);
  await chooseRecoveryNextWeek(page);
  await page
    .locator(".transfer-group")
    .getByRole("button", { name: "New Star", exact: true })
    .click();
  await expect(page.getByRole("dialog").locator("tbody tr")).toHaveCount(3);
  await expect(
    page.getByRole("dialog").locator("tbody tr").first(),
  ).toContainText("90");
});

test("the availability assumption shapes comparisons and survives a reload", async ({
  page,
}) => {
  await routeRecentFormWithInjuredPlayer8(page);
  await importTeam(page);
  await chooseRecoveryNextWeek(page);
  await compareTransfer(page, "8", "New Star");
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
  await expectNoHorizontalOverflow(page);
  await page.reload();
  await page.getByRole("button", { name: "Edit team details" }).click();
  await expect(page.getByLabel("Availability assumption")).toHaveValue(
    "recover-next-week",
  );
});

test("a preview without free transfers shows the hit and each lineup week", async ({
  page,
}) => {
  await importTeam(page);
  await confirmTeamDetails(page, { bank: "0.4", freeTransfers: "0" });
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
});

test("pitch players open details and Escape returns keyboard focus", async ({
  page,
}) => {
  await importTeam(page);
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
  await expect
    .poll(() =>
      dialog.evaluate((element) => element.scrollWidth <= element.clientWidth),
    )
    .toBe(true);
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

async function previewFirstOfThreeGroups(page: Page) {
  const data = fixtureData();
  withPlayer(data, NEW_STAR_INDEX, {
    id: 17,
    web_name: "Alternative One",
    team: 6,
  });
  withPlayer(data, NEW_STAR_INDEX, {
    id: 18,
    web_name: "Alternative Two",
    team: 6,
  });
  await routeData(page, data);
  await importTeam(page);
  await expect(page.locator(".transfer-group")).toHaveCount(3);
  const choices = page.getByRole("button", {
    name: /Preview Player .* to New Star/,
  });
  const first = choices.first();
  await first.scrollIntoViewIfNeeded();
  const scrollBefore = await scrollY(page);
  await first.click();
  await expect(page.getByLabel("Preview starting lineup")).toBeVisible();
  return { choices, first, scrollBefore };
}

async function expectSecondChoicePreviews(page: Page, choices: Locator) {
  await choices.nth(1).click();
  await expect(
    page.getByRole("button", { name: "After", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Preview starting lineup")).toContainText(
    "New Star",
  );
}

test("previewing on desktop keeps the page position and fits the new XI on screen", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "mobile layouts move to the new XI instead");
  const { choices, first, scrollBefore } =
    await previewFirstOfThreeGroups(page);
  await expect(first).toBeFocused();
  await expect
    .poll(async () => Math.abs((await scrollY(page)) - scrollBefore))
    .toBeLessThan(3);
  await page.mouse.move(400, 350);
  await page.mouse.wheel(0, 350);
  const preview = page.getByLabel("Preview starting lineup");
  await expect
    .poll(() => bottomOf(preview))
    .toBeLessThanOrEqual(page.viewportSize()!.height);
  await expect.poll(() => topOf(preview)).toBeGreaterThanOrEqual(0);
  await page.getByRole("button", { name: "Before", exact: true }).click();
  await expectSecondChoicePreviews(page, choices);
});

test("previewing on mobile moves to the new XI and returns to the chosen option", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "desktop layouts keep the page position instead");
  const { choices, first, scrollBefore } =
    await previewFirstOfThreeGroups(page);
  const nav = page.getByRole("navigation", { name: "Planner sections" });
  await expect(page.locator("#lineup-comparison")).toBeFocused();
  await expect(
    nav.getByRole("link", { name: "Squad", exact: true }),
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
  await page.getByRole("button", { name: "Before", exact: true }).click();
  await page.getByRole("link", { name: "Back to options" }).click();
  await expect(first).toBeFocused();
  await expect
    .poll(async () => Math.abs((await scrollY(page)) - scrollBefore))
    .toBeLessThan(3);
  await expect(
    nav.getByRole("link", { name: "Options", exact: true }),
  ).toHaveAttribute("aria-current", "location");
  await expectSecondChoicePreviews(page, choices);
});

test("the XI panel uses the page scroll rather than a nested scrollbar", async ({
  page,
}) => {
  await importTeam(page);
  const squad = page.getByRole("region", { name: "Your squad and locks" });
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
  await expect
    .poll(() => squad.evaluate((element) => element.scrollTop))
    .toBe(0);
  await expectNoHorizontalOverflow(page);
});

test("returning starters distinguish expected minutes from recent starting minutes", async ({
  page,
}) => {
  const data = fixtureData();
  data.bootstrap.elements[7].minutes = 319;
  data.bootstrap.elements[7].starts = 4;
  await routeData(page, data);
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
  await importTeam(page);
  await expect(shortlistHeading(page)).toBeVisible();
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
  const expectedMinutes = async () =>
    Number(await expected.locator("dd").innerText());
  await expect.poll(expectedMinutes).toBeGreaterThan(60);
  await expect.poll(expectedMinutes).toBeLessThan(73);
  await expect(starting.locator("dd")).toHaveText("73");
  await expect(dialog).toContainText(
    "Four consecutive starts give the recent role extra weight",
  );
  await expect(dialog).toContainText(
    "4 starts in the latest four completed matches",
  );
});

test("desktop layouts hide the planner section navigation", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "mobile layouts show the section navigation");
  await importTeam(page);
  await expect(page.locator(".transfer-group")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Planner sections" }),
  ).toBeHidden();
});

test("mobile navigation reaches each section and opens comparison", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "desktop layouts hide the section navigation");
  await importTeam(page);
  await expect(page.locator(".transfer-group")).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Planner sections" });
  await expect(nav).toBeInViewport();
  for (const [name, id] of [
    ["Squad", "planner-squad"],
    ["Compare", "planner-compare"],
    ["Options", "planner-options"],
  ]) {
    const link = nav.getByRole("link", { name, exact: true });
    await expect.poll(() => heightOf(link)).toBeGreaterThanOrEqual(44);
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
  await expectNoHorizontalOverflow(page);
});
