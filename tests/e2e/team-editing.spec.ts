import {
  expect,
  failHistory,
  importResponse,
  routeImport,
  squadPicks,
  test,
} from "./support/fixtures";
import {
  bottomOf,
  expectNoHorizontalOverflow,
  expireData,
  gate,
  importTeam,
  replaceSquadPlayer,
  saveAndViewShortlist,
  saveShortlistButton,
  shortlistHeading,
  topOf,
} from "./support/planner";

test("imported team details stay read-only until team editing starts", async ({
  page,
}) => {
  await importTeam(page);
  await page.getByRole("button", { name: "Edit team details" }).click();
  await expect(page.getByText("Team #123 · GW8 picks")).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Replace Player 8", exact: true }),
  ).toHaveCount(0);
});

test("corrected team details focus the shortlist and survive a reload", async ({
  page,
}) => {
  await importTeam(page);
  await page.getByRole("button", { name: "Edit team details" }).click();
  await page.getByRole("button", { name: "Edit team", exact: true }).click();
  await replaceSquadPlayer(page, "Player 8", "New Star");
  await replaceSquadPlayer(page, "New Star", "Player 8");
  await page.getByLabel("Bank balance (£m)").fill("0.4");
  await page.getByLabel("Free transfers remaining").selectOption("0");
  await saveAndViewShortlist(page);
  await expect(shortlistHeading(page)).toBeFocused();
  await page.reload();
  await page.getByRole("button", { name: "Edit team details" }).click();
  await expect(page.getByLabel("Bank balance (£m)")).toHaveValue("0.4");
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await saveAndViewShortlist(page);
  await expect(page.locator(".transfer-price-note")).toHaveCount(0);
});

test("editing inputs during history loading cannot publish stale results", async ({
  page,
}) => {
  await failHistory(page);
  await importTeam(page);
  await page.getByRole("button", { name: "Edit team details" }).click();
  await page.getByLabel("Bank balance (£m)").fill("0.6");
  const history = gate();
  await page.route("**/api/history/*", async (route) => {
    await history.opened;
    await route.fulfill({ json: { history: [] } });
  });
  await saveAndViewShortlist(page);
  await expect(saveShortlistButton(page)).toBeDisabled();
  await page.getByLabel("Bank balance (£m)").fill("1.2");
  history.release();
  await expect(saveShortlistButton(page)).toBeEnabled();
  await expect(
    page.getByRole("heading", { name: "Your team", exact: true }),
  ).toBeVisible();
  await saveAndViewShortlist(page);
  await expect(shortlistHeading(page)).toBeVisible();
  await expect(page.locator(".workspace-figures")).toContainText("£1.2m");
});

test("team editing can return or discard without recalculating or saving drafts", async ({
  page,
}) => {
  await importTeam(page);
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
  await expect(shortlistHeading(page)).toBeVisible();
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
  expect(historyRequests).toBe(0);
  await page.reload();
  await page.getByRole("button", { name: "Edit team details" }).click();
  await expect(page.getByLabel("Bank balance (£m)")).toHaveValue("0.5");
});

test("team updates clear import guidance and keep the expanded action reachable", async ({
  page,
}) => {
  await importTeam(page);
  await page.getByRole("button", { name: "Edit team details" }).click();
  await page.getByRole("button", { name: "Edit team", exact: true }).click();
  await page
    .getByRole("button", { name: "Replace Player 8", exact: true })
    .scrollIntoViewIfNeeded();
  const action = saveShortlistButton(page);
  await expect.poll(() => topOf(action)).toBeGreaterThanOrEqual(0);
  await expect
    .poll(() => bottomOf(action))
    .toBeLessThanOrEqual(page.viewportSize()!.height);
  await expectNoHorizontalOverflow(page);
  await page.getByRole("button", { name: "Hide players" }).click();
  await expect(page.locator(".squad-editor")).toHaveCount(0);
  await page.getByLabel("Free transfers remaining").selectOption("2");
  await saveAndViewShortlist(page);
  await page.getByRole("button", { name: "Edit team details" }).click();
  await expect(page.getByLabel("Free transfers remaining")).toHaveValue("2");
  await expect(
    page.getByText("Free transfers default to 1", { exact: false }),
  ).toHaveCount(0);
});

test("returning from team editing preserves the plan category and selected plan", async ({
  page,
}) => {
  await importTeam(page);
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
  await importTeam(page);
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
  await expect(search).toBeFocused();
  await expect(search).toHaveAttribute("aria-expanded", "false");
  await search.press("Escape");
  await expect(replace).toBeFocused();
  await expect(search).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Discard changes" }),
  ).toHaveCount(0);
  await replace.click();
  await search.fill("New Star");
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

test("replacing an unavailable player keeps focus on the replaced row", async ({
  page,
}) => {
  await routeImport(page, importResponse({ picks: squadPicks({ 7: 999 }) }));
  await importTeam(page);
  await page
    .getByRole("button", {
      name: "Replace Unavailable player #999",
      exact: true,
    })
    .click();
  await page
    .getByRole("combobox", {
      name: "Replacement for Unavailable player #999",
      exact: true,
    })
    .fill("New Star");
  await page.getByRole("option", { name: /New Star/ }).click();
  await expect(
    page.getByRole("button", { name: "Replace New Star", exact: true }),
  ).toBeFocused();
});

test("returning from team editing on expired data keeps the plan category and selected plan", async ({
  page,
}) => {
  await importTeam(page);
  await page
    .getByRole("button", { name: "Roll then move", exact: true })
    .click();
  await page.locator(".transfer-plan .preview-toggle").first().click();
  await page.getByRole("button", { name: "Edit team details" }).click();
  await expireData(page);
  await page.getByRole("button", { name: "View shortlist" }).click();
  await expect(page.locator(".workspace-heading .eyebrow")).toContainText(
    "THE NEXT MOVE",
  );
  await expect(
    page.getByRole("button", { name: "Roll then move", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.locator('.transfer-plan .preview-toggle[aria-pressed="true"]'),
  ).toHaveCount(1);
});
