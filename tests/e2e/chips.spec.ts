import type { Page } from "@playwright/test";
import {
  expect,
  fixtureData,
  importResponse,
  routeData,
  routeImport,
  test,
  withChipRules,
  withDoubleGameweek,
} from "./support/fixtures";
import {
  compareTransfer,
  expireData,
  expectNoHorizontalOverflow,
  focusWindow,
  gate,
  importTeam,
  shortlistHeading,
} from "./support/planner";

function chipsPanel(page: Page) {
  return page.getByRole("region", { name: "Chips" });
}

function chipRow(page: Page, chip: string) {
  return chipsPanel(page).locator(`[data-testid^="chip-${chip}"]`).first();
}

function lineupHeading(page: Page) {
  return page.locator(".lineup-preview__selection h3");
}

async function importWithChips(
  page: Page,
  chipsPlayed: { name: string; event: number }[] = [],
  doubleWeek: number | null = null,
  windows?: Parameters<typeof withChipRules>[1],
) {
  const data = withChipRules(fixtureData(), windows);
  if (doubleWeek !== null) withDoubleGameweek(data, doubleWeek);
  await routeData(page, data);
  await routeImport(page, importResponse({ chipsPlayed }));
  await importTeam(page);
  await expect(shortlistHeading(page)).toBeVisible();
}

test("the chips panel shows used chips and holds the rest below their bars", async ({
  page,
}) => {
  await importWithChips(page, [
    { name: "bboost", event: 2 },
    { name: "wildcard", event: 3 },
  ]);
  await expect(chipsPanel(page)).toContainText("GW9–12");
  await expect(chipRow(page, "wildcard")).toContainText("Used GW3");
  await expect(chipRow(page, "wildcard")).toContainText("Another opens GW20.");
  await expect(chipRow(page, "bboost")).toContainText("Used GW2");
  await expect(chipRow(page, "3xc")).toContainText("Hold");
  await expect(chipRow(page, "3xc")).toContainText(
    /Best GW\d+ \+\d+\.\d pts, under the 8\.0 pts bar\./,
  );
  await expect(chipRow(page, "freehit")).toContainText(
    "Gains nothing worth playing in GW",
  );
  await expect(chipsPanel(page)).toContainText(
    "Chip advice looks 4 gameweeks ahead (GW9–12)",
  );
  await expect(chipsPanel(page)).toContainText(
    "A chip’s value outside that horizon is unknown",
  );
});

test("a double gameweek earns Bench Boost a play, and Triple Captain gives way", async ({
  page,
}) => {
  await importWithChips(page, [], 11);
  await expect(chipRow(page, "bboost")).toContainText("Play GW11");
  await expect(chipRow(page, "bboost")).toContainText(
    "clearing the 15.0 pts bar",
  );
  await expect(chipRow(page, "3xc")).toContainText(
    "Bench Boost gains more that week. One chip per gameweek.",
  );
});

test("a chip that expires inside the horizon is played in its best remaining week", async ({
  page,
}) => {
  await importWithChips(page, [], null, [
    ["3xc", 1, 10],
    ["3xc", 20, 38],
    ["wildcard", 2, 10],
  ]);
  await expect(chipRow(page, "3xc")).toContainText(/Play GW(9|10)/);
  await expect(chipRow(page, "3xc")).toContainText(
    "Expires after GW10, so holding is worth nothing.",
  );
  await expect(chipRow(page, "wildcard")).toContainText("Expires after GW10");
  await expect(chipRow(page, "wildcard")).toContainText(
    "keeps scoring after GW12",
  );
});

test("both halves of a chip are listed and labelled by their windows", async ({
  page,
}) => {
  await importWithChips(page, [], null, [
    ["3xc", 1, 10],
    ["3xc", 11, 38],
  ]);
  const rows = chipsPanel(page).getByRole("heading", { level: 3 });
  await expect(rows).toHaveText([
    "Triple Captain · GW1–10",
    "Triple Captain · GW11–38",
  ]);
  await expect(chipsPanel(page).getByTestId("chip-3xc-1")).toBeVisible();
  await expect(chipsPanel(page).getByTestId("chip-3xc-11")).toBeVisible();
});

test("the Wildcard is valued against your plan and previews its rebuilt XI", async ({
  page,
}) => {
  await importWithChips(page);
  await expect(chipRow(page, "wildcard")).toContainText(
    "Measured against your recommended plan, or holding if none.",
  );
  await expect(chipRow(page, "wildcard")).toContainText(
    "A Wildcard squad keeps scoring after GW12, but that value is unknown",
  );
  await expect(chipRow(page, "wildcard")).toContainText(/over GW\d+–12/);
  await page.getByRole("button", { name: /Preview Wildcard in GW/ }).click();
  const pitch = page.getByRole("complementary", {
    name: "Wildcard preview lineup",
  });
  await expect(pitch).toContainText("Your Wildcard XI");
  await expect(pitch.getByRole("button", { name: /New Star/ })).toBeVisible();
  await expect(page.locator(".lineup-preview .metric").first()).toContainText(
    /Expected gain · GW\d+–12/,
  );
});

test("previewing Bench Boost puts the whole bench on the pitch", async ({
  page,
}) => {
  await importWithChips(page, [], 11);
  const preview = page.getByRole("button", {
    name: "Preview Bench Boost in GW11",
  });
  await preview.click();
  await expect(preview).toHaveAttribute("aria-pressed", "true");
  const pitch = page.getByRole("complementary", {
    name: "Bench Boost preview lineup",
  });
  await expect(pitch).toContainText("All 15 play");
  await expect(pitch.locator(".pitch-board__player")).toHaveCount(15);
  await expect(pitch.locator(".pitch-board__player--boosted")).toHaveCount(4);
  await expect(pitch.locator(".pitch-board__formation")).toHaveText(
    "SHAPEAll 15",
  );
  await page.getByText("Bench and XI changes", { exact: true }).click();
  await expect(page.getByRole("list", { name: "Bench order" })).toHaveCount(0);
  await expect(lineupHeading(page)).toHaveText("Bench Boost · GW11");
  await expect(
    page.getByRole("group", { name: "Lineup gameweek" }).getByRole("button", {
      name: "Show lineup GW11",
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Clear preview" }).click();
  await expect(
    page.getByRole("complementary", { name: "Baseline starting lineup" }),
  ).toBeVisible();
  await expect(preview).toHaveAttribute("aria-pressed", "false");
});

test("previewing Triple Captain marks the captain ×3 and follows the week", async ({
  page,
}) => {
  await importWithChips(page);
  await page
    .getByRole("button", { name: /Preview Triple Captain in GW/ })
    .click();
  const pitch = page.getByRole("complementary", {
    name: "Triple Captain preview lineup",
  });
  await expect(pitch.locator(".pitch-board__captain")).toHaveText("×3");
  await expect(
    pitch.getByRole("button", { name: /, triple captain$/ }),
  ).toHaveCount(1);
  await expect(pitch.locator(".pitch-board__player")).toHaveCount(11);
  await page.getByRole("button", { name: "Show lineup GW10" }).click();
  await expect(lineupHeading(page)).toHaveText("Triple Captain · GW10");
  await expect(page.locator(".lineup-preview .metric").first()).toContainText(
    "Expected gain · GW10",
  );
});

test("previewing Free Hit shows the one-week XI with its new players", async ({
  page,
}) => {
  await importWithChips(page);
  await page.getByRole("button", { name: /Preview Free Hit in GW/ }).click();
  const pitch = page.getByRole("complementary", {
    name: "Free Hit preview lineup",
  });
  await expect(pitch).toContainText("Your Free Hit XI");
  await expect(pitch.getByRole("button", { name: /New Star/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Captain pick" })).toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: /Preview Player .* to New Star/ })
    .first()
    .click();
  await expect(
    page.getByRole("complementary", { name: "Preview starting lineup" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Preview Free Hit in GW/ }),
  ).toHaveAttribute("aria-pressed", "false");
});

test("comparing your own transfer replaces a chip preview", async ({
  page,
}) => {
  await importWithChips(page, [], 11);
  const chip = page.getByRole("button", {
    name: "Preview Bench Boost in GW11",
  });
  await chip.click();
  await compareTransfer(page, "8", "New Star");
  await expect(
    page.getByRole("complementary", { name: "Preview starting lineup" }),
  ).toBeVisible();
  await expect(lineupHeading(page)).toHaveText("Player 8 → New Star");
  await expect(chip).toHaveAttribute("aria-pressed", "false");
});

test("pressing a chip preview again turns it off", async ({ page }) => {
  await importWithChips(page);
  const chip = page.getByRole("button", {
    name: /Preview Triple Captain in GW/,
  });
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "false");
  await expect(
    page.getByRole("complementary", { name: "Baseline starting lineup" }),
  ).toBeVisible();
});

test("pressing a chip preview after switching weeks goes back to its week", async ({
  page,
}) => {
  await importWithChips(page, [], 11);
  const chip = page.getByRole("button", {
    name: "Preview Bench Boost in GW11",
  });
  await chip.click();
  await page.getByRole("button", { name: "Show lineup GW12" }).click();
  await expect(lineupHeading(page)).toHaveText("Bench Boost · GW12");
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await expect(lineupHeading(page)).toHaveText("Bench Boost · GW11");
});

test("a chip preview ends when you show a week outside the chip's window", async ({
  page,
}) => {
  await importWithChips(page, [], null, [
    ["bboost", 1, 10],
    ["bboost", 20, 38],
  ]);
  const chip = page.getByRole("button", { name: /Preview Bench Boost in GW/ });
  await chip.click();
  await page.getByRole("button", { name: "Show lineup GW11" }).click();
  await expect(chip).toHaveAttribute("aria-pressed", "false");
  await expect(
    page.getByRole("complementary", { name: "Baseline starting lineup" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear preview" })).toHaveCount(
    0,
  );
});

test("a restored plan refreshes its chips, or says they are from the save", async ({
  page,
}) => {
  await importWithChips(page, [{ name: "3xc", event: 4 }]);
  const answer = gate();
  await page.route("**/api/import?*", async (route) => {
    await answer.opened;
    await route.fulfill({
      json: importResponse({
        chipsPlayed: [
          { name: "3xc", event: 4 },
          { name: "bboost", event: 8 },
        ],
      }),
    });
  });
  await page.reload();
  await expect(shortlistHeading(page)).toBeVisible();
  await expect(chipsPanel(page)).toContainText(
    "Checking FPL for chips you’ve played",
  );
  await expect(chipRow(page, "bboost")).not.toContainText("Used");
  answer.release();
  await expect(chipRow(page, "bboost")).toContainText("Used GW8");
  await expect(chipsPanel(page)).not.toContainText("from when this plan");
  await routeImport(page, { error: "Unavailable" }, 503);
  await page.reload();
  await expect(chipRow(page, "bboost")).toContainText("Used GW8");
  await expect(chipsPanel(page)).toContainText(
    "Chip status is from when this plan was saved",
  );
});

test("previewing a chip during a refresh lets the refresh finish", async ({
  page,
}) => {
  const refresh = gate();
  let expired = false;
  await page.route("**/api/data", async (route) => {
    if (!expired) return route.fulfill({ json: withChipRules(fixtureData()) });
    await refresh.opened;
    return route.fulfill({
      json: withChipRules(fixtureData(), [
        ["3xc", 1, 10],
        ["3xc", 20, 38],
      ]),
    });
  });
  await routeImport(page, importResponse({ chipsPlayed: [] }));
  await importTeam(page);
  await expect(shortlistHeading(page)).toBeVisible();
  expired = true;
  await expireData(page);
  await focusWindow(page);
  const eyebrow = page.locator(".workspace-heading .eyebrow");
  await expect(eyebrow).toContainText("REFRESHING");
  await page
    .getByRole("button", { name: /Preview Triple Captain in GW/ })
    .click();
  refresh.release();
  await expect(eyebrow).toContainText("THE NEXT MOVE");
  await expect(chipRow(page, "3xc")).toContainText("Expires after GW10");
});

test("an import without played chips offers to load them from FPL", async ({
  page,
}) => {
  await routeData(page, withChipRules(fixtureData()));
  await importTeam(page);
  await expect(shortlistHeading(page)).toBeVisible();
  await expect(chipsPanel(page)).toContainText(
    "FPL didn’t send the chips you’ve played.",
  );
  await expect(chipsPanel(page)).not.toContainText("saved plan");
  await expect(chipsPanel(page)).toContainText(
    "Refreshing re-imports your squad, bank and free transfers",
  );
  await routeImport(
    page,
    importResponse({ chipsPlayed: [{ name: "3xc", event: 4 }] }),
  );
  await chipsPanel(page)
    .getByRole("button", { name: "Refresh from FPL" })
    .click();
  await expect(chipRow(page, "3xc")).toContainText("Used GW4");
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("a chip preview scrolls to the lineup without overflowing", async ({
    page,
  }) => {
    await importWithChips(page, [], 11);
    await expectNoHorizontalOverflow(page);
    await page
      .getByRole("button", { name: "Preview Bench Boost in GW11" })
      .click();
    await expect(
      page.getByRole("complementary", { name: "Bench Boost preview lineup" }),
    ).toBeInViewport();
    await expectNoHorizontalOverflow(page);
  });
});
