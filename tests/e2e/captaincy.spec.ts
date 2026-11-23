import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import {
  expectNoHorizontalOverflow,
  importTeam,
  shortlistHeading,
} from "./support/planner";

const TOUCH_TARGET = 40;

function captainPick(page: Page) {
  return page.getByRole("region", { name: "Captain pick" });
}

function captainOptions(page: Page) {
  return captainPick(page).getByRole("listitem");
}

function benchOrder(page: Page) {
  return page.getByRole("list", { name: "Bench order" }).getByRole("listitem");
}

async function pitchCaptainName(page: Page) {
  const label = await page
    .locator(".pitch-board")
    .getByRole("button", { name: /, captain/ })
    .getAttribute("aria-label");
  return label?.match(/^View (.+?) details/)?.[1];
}

async function openBench(page: Page) {
  await page.getByText("Bench and XI changes", { exact: true }).click();
}

async function previewNewStar(page: Page) {
  await page
    .getByRole("button", { name: "Preview Player 8 to New Star" })
    .click();
  await expect(
    page.getByRole("button", { name: "After", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
}

test("the lineup shows the pitch captain first with two more options", async ({
  page,
}) => {
  await importTeam(page);
  await expect(shortlistHeading(page)).toBeVisible();
  await expect(captainPick(page)).toContainText("GW9");
  await expect(captainOptions(page)).toHaveCount(3);
  for (const option of await captainOptions(page).all())
    await expect(option).toHaveText(/\d+\.\d/);
  const captain = await pitchCaptainName(page);
  expect(captain).toBeTruthy();
  await expect(captainOptions(page).first()).toContainText(captain!);
  await expect(captainPick(page)).toContainText(/Points double as captain\.$/);
});

test("the bench lists the backup keeper and three numbered substitutes", async ({
  page,
}) => {
  await importTeam(page);
  await expect(shortlistHeading(page)).toBeVisible();
  await openBench(page);
  await expect(benchOrder(page)).toHaveCount(3);
  const bench = page.locator(".lineup-preview__bench");
  await expect(
    bench.getByRole("button", { name: "View Player 2 details" }),
  ).toContainText("GK");
  await expect(benchOrder(page)).not.toContainText(["Player 2"]);
  const numbers = await benchOrder(page)
    .locator(".lineup-preview__bench-slot")
    .allInnerTexts();
  expect(numbers).toEqual(["1", "2", "3"]);
});

test("the captain pick and bench follow a previewed transfer", async ({
  page,
}) => {
  await importTeam(page);
  await expect(shortlistHeading(page)).toBeVisible();
  await expect(captainOptions(page).first()).not.toContainText("New Star");
  await previewNewStar(page);
  await expect(captainOptions(page).first()).toContainText("New Star");
  expect(await pitchCaptainName(page)).toBe("New Star");
  await openBench(page);
  await expect(benchOrder(page)).toHaveCount(3);
  await expect(benchOrder(page)).not.toContainText(["New Star"]);
  await page.getByRole("button", { name: "Before", exact: true }).click();
  await expect(captainOptions(page).first()).not.toContainText("New Star");
  await page.getByRole("button", { name: "After", exact: true }).click();
  await page.getByRole("button", { name: "Show lineup GW10" }).click();
  await expect(captainPick(page)).toContainText("GW10");
  await expect(captainOptions(page).first()).toContainText("New Star");
});

test.describe("on a touch screen", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test("captain options and bench players are comfortable to tap", async ({
    page,
  }) => {
    await importTeam(page);
    await expect(shortlistHeading(page)).toBeVisible();
    await previewNewStar(page);
    await openBench(page);
    const targets = [
      ...(await captainPick(page).getByRole("button").all()),
      ...(await page
        .locator(".lineup-preview__bench")
        .getByRole("button")
        .all()),
    ];
    expect(targets).toHaveLength(7);
    for (const target of targets) {
      const box = await target.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(TOUCH_TARGET);
    }
    await expectNoHorizontalOverflow(page);
  });
});
