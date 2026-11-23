import type { Page } from "@playwright/test";
import type { Data } from "../../src/lib/schemas";
import {
  expect,
  fixtureData,
  NEW_STAR_INDEX,
  routeData,
  test,
  withPlayer,
} from "./support/fixtures";
import {
  expectNoHorizontalOverflow,
  importTeam,
  shortlistHeading,
} from "./support/planner";

const HOT_STRIKER_CLUB = 7;

function blankThenStrikerData(): Data {
  const data = withPlayer(fixtureData(), 12, {
    id: 17,
    web_name: "Hot Striker",
    team: HOT_STRIKER_CLUB,
    expected_goals: 14,
  });
  for (const week of [10, 11, 12])
    data.fixtures.push({
      id: 900 + week,
      event: week,
      team_h: HOT_STRIKER_CLUB,
      team_a: 17,
      team_h_difficulty: 3,
      team_a_difficulty: 3,
      finished: false,
      kickoff_time: "2026-10-31T12:00:00Z",
    });
  data.bootstrap.elements[NEW_STAR_INDEX].expected_goals = 1;
  return data;
}

async function openPlanAhead(page: Page) {
  await routeData(page, blankThenStrikerData());
  await importTeam(page);
  await expect(shortlistHeading(page)).toBeVisible();
  await page.getByRole("button", { name: "Plan ahead", exact: true }).click();
  return page.getByRole("article", { name: "Recommended plan" });
}

test("plan ahead holds through a blank week and buys when the fixtures return", async ({
  page,
}) => {
  const plan = await openPlanAhead(page);
  const weeks = plan
    .getByRole("list", { name: /week by week/ })
    .locator(":scope > li");
  await expect(weeks).toHaveCount(4);
  await expect(weeks.nth(0)).toContainText("Hold · bank a free transfer");
  await expect(weeks.nth(1)).toContainText("Hot Striker");
  await expect(weeks.nth(1)).toContainText("2 FT → 1 left · No hit");
  await expect(plan).toContainText("Plans run optimistic");
  await plan.getByText("How this plan was found · limits").click();
  await expect(plan).toContainText("Bounded search");
  await expect(plan).toContainText("today's purchase and selling prices");
  await expect(plan).toContainText("Ignores future injury news");
  await expectNoHorizontalOverflow(page);
});

test("previewing a plan shows each week's XI through the gameweek switcher", async ({
  page,
}) => {
  const plan = await openPlanAhead(page);
  await plan
    .getByRole("button", { name: "Preview plan: Recommended plan" })
    .click();
  await expect(
    plan.getByRole("button", { name: "Preview plan: Recommended plan" }),
  ).toHaveAttribute("aria-pressed", "true");
  const lineup = page.getByRole("complementary", { name: "Lineup comparison" });
  await expect(
    lineup.getByRole("button", { name: "Show lineup GW9" }),
  ).toHaveAttribute("aria-pressed", "true");
  const pitch = lineup.locator(".pitch-board");
  await expect(pitch).not.toContainText("Hot Striker");
  await plan.getByRole("button", { name: /Show GW10 lineup/ }).click();
  await expect(
    lineup.getByRole("button", { name: "Show lineup GW10" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(pitch).toContainText("Hot Striker");
  await expect(page.locator("#selected-option")).toBeAttached();
});

test("choosing a week from an unselected plan previews that plan", async ({
  page,
}) => {
  const plan = await openPlanAhead(page);
  await plan.getByRole("button", { name: /Show GW11 lineup/ }).click();
  await expect(
    plan.getByRole("button", { name: "Preview plan: Recommended plan" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page
      .getByRole("complementary", { name: "Lineup comparison" })
      .getByRole("button", { name: "Show lineup GW11" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("plan ahead says when holding beats every plan", async ({ page }) => {
  const data = fixtureData();
  data.bootstrap.elements[NEW_STAR_INDEX].expected_goals = 1;
  await routeData(page, data);
  await importTeam(page);
  await expect(shortlistHeading(page)).toBeVisible();
  await page.getByRole("button", { name: "Plan ahead", exact: true }).click();
  await expect(page.getByText(/No plan over GW9–12 clears/)).toBeVisible();
});
