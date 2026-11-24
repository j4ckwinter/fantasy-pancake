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
  expectNoHorizontalOverflow,
  importTeam,
  shortlistHeading,
} from "./support/planner";

function chipsPanel(page: Page) {
  return page.getByRole("region", { name: "Chips" });
}

function chipRow(page: Page, chip: string) {
  return chipsPanel(page).getByTestId(`chip-${chip}`);
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
    "under the 20.0 pts bar",
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
  await expect(chipRow(page, "wildcard")).toContainText(
    "Usable GW9–12, window GW2–19",
  );
  await expect(
    chipRow(page, "wildcard").getByRole("button", { name: /Preview/ }),
  ).toHaveCount(0);
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
  await expect(chipRow(page, "wildcard")).toContainText("Expires after GW10.");
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

test("an import without played chips offers to load them from FPL", async ({
  page,
}) => {
  await routeData(page, withChipRules(fixtureData()));
  await importTeam(page);
  await expect(shortlistHeading(page)).toBeVisible();
  await expect(chipsPanel(page)).toContainText(
    "doesn’t know which chips you’ve played",
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
