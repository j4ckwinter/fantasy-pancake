import {
  expect,
  fixtureData,
  NEW_STAR_INDEX,
  newDefender,
  routeData,
  test,
  withPlayer,
} from "./support/fixtures";
import {
  bottomOf,
  confirmTeamDetails,
  expectNoHorizontalOverflow,
  gapBetween,
  heightOf,
  importTeam,
  saveAndViewShortlist,
  shortlistHeading,
} from "./support/planner";

test("a confirmed over-limit squad only gets corrective transfers", async ({
  page,
}) => {
  const data = fixtureData();
  data.bootstrap.elements[7].team = 1;
  await routeData(page, data);
  await importTeam(page);
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
  await routeData(page, data);
  await importTeam(page);
  await page.getByRole("button", { name: "Edit team details" }).click();
  await page.getByLabel("Bank balance (£m)").fill("0");
  await saveAndViewShortlist(page);
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

test("pair plans show combined transfers and correct hits", async ({
  page,
}) => {
  const data = fixtureData();
  withPlayer(data, NEW_STAR_INDEX, newDefender);
  await routeData(page, data);
  await importTeam(page);
  await page.getByRole("button", { name: "Edit team details" }).click();
  await page.getByLabel("Free transfers remaining").selectOption("2");
  await saveAndViewShortlist(page);
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
  await saveAndViewShortlist(page);
  await page
    .getByRole("button", { name: "Two transfers", exact: true })
    .click();
  await expect(pair).toContainText("8 pts");
  if (test.info().project.use.isMobile) {
    await expect
      .poll(() =>
        gapBetween(
          pair.getByRole("button", { name: "Preview plan" }),
          page.getByRole("navigation", { name: "Planner sections" }),
        ),
      )
      .toBeGreaterThanOrEqual(0);
  }

  await expect(page.locator(".roll-option")).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("groups incoming options and preserves player locks across reload", async ({
  page,
}) => {
  await importTeam(page);
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

test("delayed plans preserve the first-week XI and only change later weeks", async ({
  page,
}) => {
  await importTeam(page);
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
  await expect
    .poll(() => after.locator(".pitch-board__name").allTextContents())
    .toEqual(before);
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

test("results keep optional tools collapsed and the first recommendation easy to reach", async ({
  page,
}) => {
  await importTeam(page);
  await expect(shortlistHeading(page)).toBeVisible();
  await expect(page.locator(".steps")).toHaveCount(0);
  await expect(
    page.getByRole("group", { name: "Before or after transfers" }),
  ).toHaveCount(0);
  await expect(
    page.locator(".transfer-group").first().locator(".transfer-price-note"),
  ).toHaveCount(0);
  await expect(page.locator(".alternative-gain").first()).toContainText(
    "Expected gain · GW9–12",
  );
  if (test.info().project.use.isMobile) {
    await expect
      .poll(() => heightOf(page.locator(".transfer-alternative").first()))
      .toBeLessThan(150);
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
  const firstPreview = page
    .getByRole("button", { name: /Preview Player .* to New Star/ })
    .first();
  if (test.info().project.use.isMobile) {
    await expect
      .poll(() =>
        gapBetween(
          firstPreview,
          page.getByRole("navigation", { name: "Planner sections" }),
        ),
      )
      .toBeGreaterThanOrEqual(0);
  } else {
    await expect
      .poll(() => bottomOf(firstPreview))
      .toBeLessThanOrEqual(page.viewportSize()!.height);
  }
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
  await expectNoHorizontalOverflow(page);
});

test("preview buttons toggle singles and plans back to the current XI", async ({
  page,
}) => {
  await importTeam(page);
  const single = page
    .getByRole("button", { name: /Preview Player .* to New Star/ })
    .first();
  await single.click();
  await expect(single).toHaveText("Selected");
  await expect(single).toHaveAttribute("aria-pressed", "true");
  const summary = page.locator(".lineup-preview__summary");
  await expect
    .poll(() => gapBetween(page.getByLabel("Preview starting lineup"), summary))
    .toBeGreaterThanOrEqual(0);
  await expect
    .poll(() => gapBetween(summary, page.locator("#selected-option")))
    .toBeGreaterThanOrEqual(0);
  await expect(
    page.getByText("THE EFFECT ON YOUR XI", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("#selected-option")).toBeVisible();
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
  await importTeam(page);
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

test("shortlist and saved-plan controls fit a 320px viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await importTeam(page);
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

test("the selected option explains its risks and assumptions", async ({
  page,
}) => {
  await importTeam(page);
  await confirmTeamDetails(page, { bank: "0.4", freeTransfers: "0" });
  await page
    .getByRole("button", { name: /Preview Player .* to New Star/ })
    .first()
    .click();
  await page.locator("#selected-option > summary").click();
  await page
    .getByText("Why this option · risks and assumptions", { exact: true })
    .click();
  await expect(
    page.getByRole("article", { name: "Selected transfer option" }),
  ).toContainText("season averages can miss recent changes");
  await expectNoHorizontalOverflow(page);
});

test("the shortlist shows gains in expected points with a dated accuracy note", async ({
  page,
}) => {
  await importTeam(page);
  await expect(shortlistHeading(page)).toBeVisible();
  await expect(page.locator(".alternative-gain strong").first()).toHaveText(
    /^[+−]\d+\.\d pts$/,
  );
  const note = page.locator(".forecast-accuracy");
  await expect(note).toContainText("Gains are expected FPL points.");
  await expect(note).toContainText("on 23 Nov 2026");
  await expect(note).toContainText("off by 1.9 pts a gameweek on average");
  await expect(note).toContainText("realised +1.4 pts over holding");
  await expectNoHorizontalOverflow(page);
});
