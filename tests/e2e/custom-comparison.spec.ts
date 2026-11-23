import type { Page } from "@playwright/test";
import {
  expect,
  failHistory,
  fixtureData,
  NEW_STAR_INDEX,
  routeData,
  test,
  withPlayer,
} from "./support/fixtures";
import {
  chooseIncoming,
  compareTransfer,
  expectNoHorizontalOverflow,
  gapBetween,
  gate,
  importTeam,
  openCustomComparison,
  saveAndViewShortlist,
} from "./support/planner";

function customTransferError(page: Page) {
  return page
    .getByRole("group", { name: "Custom transfer comparison" })
    .getByRole("alert");
}

test("custom comparisons preview below-threshold moves without changing the squad", async ({
  page,
}) => {
  const data = fixtureData();
  data.bootstrap.events.forEach((event) => {
    event.deadline_time = "2030-11-01T12:00:00Z";
  });
  withPlayer(data, 7, { id: 17, team: 6, web_name: "Steady Midfielder" });
  await routeData(page, data);
  await importTeam(page);
  await compareTransfer(page, "8", "Steady Midfielder");
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
  await expectNoHorizontalOverflow(page);
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

test("clearing the preview cancels an in-flight custom comparison", async ({
  page,
}) => {
  await failHistory(page);
  await importTeam(page);
  await expect(page.getByLabel("Baseline starting lineup")).toBeVisible();
  const history = gate();
  await page.route("**/api/history/*", async (route) => {
    await history.opened;
    await route.fulfill({ json: { history: [] } });
  });
  await compareTransfer(page, "8", "New Star");
  await expect(
    page.getByRole("button", { name: "Comparing…", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Clear preview", exact: true })
    .click();
  history.release();
  await expect(
    page.getByRole("button", { name: "Compare my transfer", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("article", { name: "Selected transfer option" }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Baseline starting lineup")).toBeVisible();
  await expect(page.getByLabel("Preview starting lineup")).toHaveCount(0);
});

test("custom errors follow the submitted players and weekly gains deduct the hit once", async ({
  page,
}) => {
  const data = fixtureData();
  withPlayer(data, NEW_STAR_INDEX, {
    id: 17,
    web_name: "Expensive Midfielder",
    now_cost: 100,
  });
  await routeData(page, data);
  await importTeam(page);
  await page.getByRole("button", { name: "Edit team details" }).click();
  await page.getByLabel("Free transfers remaining").selectOption("0");
  await saveAndViewShortlist(page);
  await compareTransfer(page, "8", "Expensive Midfielder");
  await expect(customTransferError(page)).toContainText("unaffordable");
  await chooseIncoming(page, "New Star");
  await expect(customTransferError(page)).toHaveCount(0);
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
  const totalCells = selected.locator(".weekly-breakdown__totals dd");
  await expect(totalCells).toHaveCount(3);
  const totals = await totalCells.allTextContents();
  const [gross, hit, net] = totals.map((value) =>
    Number(value.replace("−", "-").replace(" pts", "")),
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

test("incoming picker requires a choice and supports keyboard search", async ({
  page,
}) => {
  await importTeam(page);
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
  if (test.info().project.use.isMobile) {
    await expect(
      page.getByRole("navigation", { name: "Planner sections" }),
    ).toBeHidden();
    await expect
      .poll(() => gapBetween(page.locator(".player-picker__popup"), compare))
      .toBeGreaterThanOrEqual(0);
  }
  await picker.press("ArrowDown");
  await picker.press("Enter");
  await expect(picker).toHaveValue("New Star · T6 · £5.0m");
  await expect(compare).toBeEnabled();
  await picker.click();
  await expect
    .poll(() =>
      picker.evaluate(
        (input: HTMLInputElement) =>
          input.selectionEnd! - input.selectionStart!,
      ),
    )
    .toBe("New Star · T6 · £5.0m".length);
  await picker.press("Escape");
  await expect(picker).toHaveAttribute("aria-expanded", "false");
  await expect(compare).toBeEnabled();
  await page.getByLabel("Player to sell").selectOption("9");
  await expect(picker).toHaveValue("");
  await expect(compare).toBeDisabled();
});

test("team actions are unavailable while a custom comparison runs", async ({
  page,
}) => {
  await failHistory(page);
  await importTeam(page);
  await expect(page.getByLabel("Baseline starting lineup")).toBeVisible();
  const history = gate();
  await page.route("**/api/history/*", async (route) => {
    await history.opened;
    await route.fulfill({ json: { history: [] } });
  });
  await compareTransfer(page, "8", "New Star");
  await expect(
    page.getByRole("button", { name: "Comparing…", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Edit team details" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", {
      name: "Keep Player 1",
      exact: true,
      includeHidden: true,
    }),
  ).toBeDisabled();
  history.release();
  await expect(
    page.getByRole("button", { name: "Edit team details" }),
  ).toBeEnabled();
});
