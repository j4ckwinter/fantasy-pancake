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
  bottomOf,
  expectNoHorizontalOverflow,
  gapBetween,
  heightOf,
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

test("outdated saved settings ask for a fresh import", async ({ page }) => {
  await seedSavedSettings(page, '{"version":99}');
  await page.goto("/");
  await expect(
    page.getByText(
      "Saved settings are outdated or invalid. Import your team again.",
    ),
  ).toBeVisible();
});

test("an import with no remaining gameweeks reports an empty horizon", async ({
  page,
}) => {
  const data = fixtureData();
  data.bootstrap.events.forEach((e) => {
    e.is_next = false;
    e.is_current = false;
    e.finished = true;
  });
  await routeData(page, data);
  await importTeam(page);
  await expect(page.getByText("The horizon is empty")).toBeVisible();
});

test("the landing page carries the Fantasy Pancake brand", async ({ page }) => {
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
  await expect(page.locator("footer")).toContainText("Public FPL data");
  await expect(page.locator("footer")).not.toContainText("Data fetched");
});

test("the landing import form stays compact and aligned without overflow", async ({
  page,
}) => {
  await page.goto("/");
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
  await expect(
    page
      .getByRole("list", { name: "How the planner works" })
      .getByRole("listitem"),
  ).toHaveCount(3);
  if (test.info().project.use.isMobile) {
    await expect
      .poll(() => heightOf(page.locator(".hero > .pitch-board")))
      .toBeLessThan(300);
  }
  if (page.viewportSize()!.width > 1150) {
    await expect
      .poll(async () =>
        Math.abs((await bottomOf(input)) - (await bottomOf(button))),
      )
      .toBeLessThan(2);
  }
  await expectNoHorizontalOverflow(page);
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
  await shortlistHeading(page).scrollIntoViewIfNeeded();
  await expectNoHorizontalOverflow(page);
  await page.getByRole("button", { name: "Edit team details" }).click();
  await expect(page.locator(".squad-editor")).toHaveCount(0);
  await expect(saveShortlistButton(page)).toBeVisible();
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
  await expect
    .poll(() =>
      gapBetween(
        page.getByText("This is a Free Hit squad.", { exact: false }),
        page.locator(".squad-editor"),
      ),
    )
    .toBeGreaterThan(0);
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
  const loading = page
    .getByRole("status")
    .filter({ hasText: "Loading players and fixtures" });
  await expect(loading).toContainText("Loading players and fixtures");
  expect(
    await page
      .locator(".planner-loading__track span")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
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

test("a fresh import marks its balances as estimates until the team is updated", async ({
  page,
}) => {
  await importTeam(page);
  await expect(shortlistHeading(page)).toBeVisible();
  const figures = page.locator(".workspace-figures");
  await expect(figures).toContainText("Deadline bank");
  await expect(figures).toContainText("Assumed FTs");
  await page.getByRole("button", { name: "Edit team details" }).click();
  await page.getByLabel("Free transfers remaining").selectOption("2");
  await saveAndViewShortlist(page);
  await expect(shortlistHeading(page)).toBeVisible();
  await expect(figures).toContainText("In the bank");
  await expect(figures).not.toContainText("Assumed");
});
