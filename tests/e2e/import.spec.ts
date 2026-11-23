import {
  expect,
  fixtureData,
  importResponse,
  routeData,
  routeImport,
  squadPicks,
  test,
} from "./support/fixtures";
import {
  expectNoHorizontalOverflow,
  gate,
  importTeam,
  removeSavedTeamName,
  saveAndViewShortlist,
  saveShortlistButton,
  seedSavedSettings,
  shortlistHeading,
} from "./support/planner";

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
  const heading = shortlistHeading(page);
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

test("displays import errors and allows retry", async ({ page }) => {
  await routeImport(
    page,
    { error: "No published FPL data was found for that team or gameweek." },
    404,
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
  await seedSavedSettings(page, '{"version":99}');
  const data = fixtureData();
  data.bootstrap.events.forEach((e) => {
    e.is_next = false;
    e.is_current = false;
    e.finished = true;
  });
  await routeData(page, data);
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
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: `test-results/import-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test("normal import opens recommendations directly and keeps assumptions editable", async ({
  page,
}) => {
  await importTeam(page);
  await expect(shortlistHeading(page)).toBeVisible();
  await expect(saveShortlistButton(page)).toHaveCount(0);
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
  await expectNoHorizontalOverflow(page);
  await page.getByRole("button", { name: "Edit team details" }).click();
  await expect(page.locator(".squad-editor")).toHaveCount(0);
  await expect(saveShortlistButton(page)).toBeVisible();
  await page.screenshot({
    path: `test-results/team-settings-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.getByLabel("Bank balance (£m)").fill("1.2");
  await page.getByLabel("Free transfers remaining").selectOption("2");
  await saveAndViewShortlist(page);
  await expect(shortlistHeading(page)).toBeVisible();
  await expect(page.locator(".workspace-figures")).toContainText("£1.2m");
  await expect(
    page.locator(".workspace-figures").getByText("2", { exact: true }),
  ).toBeVisible();
});

test("Free Hit imports require permanent-squad correction before recommending", async ({
  page,
}) => {
  await routeImport(page, importResponse({ active_chip: "freehit" }));
  await importTeam(page);
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
  await expect(shortlistHeading(page)).toHaveCount(0);
  await expect(saveShortlistButton(page)).toBeVisible();
});

test("loading panel follows real requests and respects reduced motion", async ({
  page,
}) => {
  const data = gate();
  await page.route("**/api/data", async (route) => {
    await data.opened;
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
  data.release();
  await expect(loading).toHaveCount(0);
  await expect(page.getByLabel("FPL team ID")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("team names appear in both headings and survive saved sessions", async ({
  page,
}) => {
  await routeImport(page, importResponse({ teamName: "The Pancake XI" }));
  await importTeam(page);
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
  await removeSavedTeamName(page);
  await page.reload();
  await expect(page.locator(".workspace-heading .eyebrow")).toContainText(
    "The Pancake XI",
  );
  await expect(page.locator(".workspace-figures")).toContainText("£1.2m");
  await routeImport(page, { error: "Unavailable" }, 503);
  await removeSavedTeamName(page);
  await page.reload();
  await expect(page.locator(".workspace-heading .eyebrow")).toContainText(
    "Team #123",
  );
  await expect(page.locator(".workspace-figures")).toContainText("£1.2m");
});

test("an invalid initial imported squad opens correction instead of losing the import", async ({
  page,
}) => {
  await routeImport(
    page,
    importResponse({
      teamName: "Needs correction",
      entry_history: { event: 8, bank: 5 },
      picks: squadPicks({ 7: 999 }),
    }),
  );
  await importTeam(page);
  await expect(
    page.getByRole("heading", { name: "Your team", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".team-settings-header")).toContainText(
    "Needs correction",
  );
  await expect(page.getByLabel("Bank balance (£m)")).toHaveValue("0.5");
  await expect(shortlistHeading(page)).toHaveCount(0);
});
