import {
  expect,
  failHistory,
  fixtureData,
  importResponse,
  NEW_STAR_INDEX,
  newDefender,
  routeImport,
  squadPicks,
  test,
  withPlayer,
} from "./support/fixtures";
import {
  expireData,
  focusWindow,
  importTeam,
  savedSettings,
  savedSettingsText,
  shortlistHeading,
} from "./support/planner";

test("history failures fall back without blocking comparisons", async ({
  page,
}) => {
  await failHistory(page);
  await importTeam(page);
  await expect(shortlistHeading(page)).toBeVisible();
  await expect(page.locator(".transfer-group")).toHaveCount(1);
  await page
    .getByRole("button", { name: /Preview Player .* to New Star/ })
    .first()
    .click();
  await expect(page.getByLabel("Preview starting lineup")).toBeVisible();
});

test("saved plans remain intact until an explicit successful FPL refresh", async ({
  page,
}) => {
  await importTeam(page);
  await page.getByRole("button", { name: "Edit team details" }).click();
  await page.getByLabel("Bank balance (£m)").fill("1.2");
  await page.getByLabel("Free transfers remaining").selectOption("3");
  await page.getByRole("button", { name: "Save & view shortlist" }).click();
  await page.reload();
  const savedPlan = page.getByRole("complementary", { name: "Saved plan" });
  await expect(savedPlan).toContainText("Saved plan · GW8 picks");
  await expect(page.locator(".workspace-figures")).toContainText("£1.2m");
  const original = await savedSettingsText(page);
  await routeImport(page, { error: "FPL temporarily unavailable" }, 503);
  await savedPlan.getByRole("button", { name: "Refresh from FPL" }).click();
  await expect(
    page.getByText("FPL temporarily unavailable", { exact: true }),
  ).toBeVisible();
  await expect(savedPlan).toBeVisible();
  await expect(page.locator(".workspace-figures")).toContainText("£1.2m");
  expect(await savedSettingsText(page)).toBe(original);
  await routeImport(
    page,
    importResponse({
      entry_history: { event: 9, bank: 8 },
      picks: squadPicks({ 7: 999 }),
    }),
  );
  await savedPlan.getByRole("button", { name: "Refresh from FPL" }).click();
  await expect(page.getByText(/Player 999 is no longer/)).toBeVisible();
  await expect(savedPlan).toContainText("Saved plan · GW8 picks");
  expect(await savedSettingsText(page)).toBe(original);
  await routeImport(
    page,
    importResponse({
      teamName: "Refreshed XI",
      entry_history: { event: 9, bank: 8 },
      picks: squadPicks({ 7: 16 }),
    }),
  );
  await savedPlan.getByRole("button", { name: "Refresh from FPL" }).click();
  await expect(savedPlan).toHaveCount(0);
  await expect(page.locator(".workspace-heading .eyebrow")).toContainText(
    "Refreshed XI",
  );
  await expect(page.locator(".workspace-figures")).toContainText("£0.8m");
  const refreshed = await savedSettings(page);
  expect(refreshed.sourceGameweek).toBe(9);
  expect(refreshed.freeTransfers).toBe(1);
  expect(refreshed.squad.map((pick: { id: number }) => pick.id)).toContain(16);
  expect(refreshed.squad.map((pick: { id: number }) => pick.id)).not.toContain(
    8,
  );
});

test("expired planning data and histories refresh on focus without replacing the squad", async ({
  page,
}) => {
  let dataRequests = 0;
  let historyRequests = 0;
  let refreshed = false;
  await page.route("**/api/data", (route) => {
    dataRequests++;
    const data = fixtureData();
    if (refreshed) {
      data.bootstrap.events.forEach((event) => {
        event.is_current = event.id === 9;
        event.is_next = event.id === 10;
        event.finished = event.id < 9;
      });
      data.bootstrap.elements[7].now_cost = 55;
      data.bootstrap.elements[8].now_cost = 54;
    }
    return route.fulfill({ json: data });
  });
  await page.route("**/api/history/*", (route) => {
    historyRequests++;
    return route.fulfill({ json: { history: [] } });
  });
  await importTeam(page);
  await expect(page.locator(".workspace-horizon")).toHaveText("GW9–12");
  await page
    .getByRole("button", { name: "Preview Player 8 to New Star" })
    .click();
  await page.locator("#selected-option > summary").click();
  await page.getByText("Check selling prices", { exact: true }).click();
  await page.getByLabel("Selling price for Player 8 (£m)").fill("4.9");
  await page
    .getByRole("button", { name: "Confirm price", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Selling price confirmed" }),
  ).toBeVisible();
  const historyCount = historyRequests;
  const initialDataRequests = dataRequests;
  refreshed = true;
  await expireData(page);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator(".workspace-horizon")).toHaveText("GW10–12");
  expect(dataRequests).toBe(initialDataRequests + 1);
  await expect.poll(() => historyRequests).toBeGreaterThan(historyCount);
  const saved = await savedSettings(page);
  expect(saved.bank).toBe(5);
  expect(
    saved.squad.find((pick: { id: number }) => pick.id === 8).sellingPrice,
  ).toBe(49);
  expect(
    saved.squad.find((pick: { id: number }) => pick.id === 9).sellingPrice,
  ).toBe(54);
  expect(saved.squad.map((pick: { id: number }) => pick.id)).toEqual(
    Array.from({ length: 15 }, (_, i) => i + 1),
  );
});

test("expired data refresh waits for edited settings and failures can be retried", async ({
  page,
}) => {
  let dataRequests = 0;
  let failRefresh = false;
  await page.route("**/api/data", (route) => {
    dataRequests++;
    return failRefresh
      ? route.fulfill({ status: 503, json: { error: "Refresh unavailable" } })
      : route.fulfill({ json: fixtureData() });
  });
  await importTeam(page);
  await page.getByRole("button", { name: "Edit team details" }).click();
  await page.getByLabel("Bank balance (£m)").fill("1.2");
  const initialDataRequests = dataRequests;
  await expireData(page);
  await focusWindow(page);
  await expect(page.getByLabel("Bank balance (£m)")).toHaveValue("1.2");
  expect(dataRequests).toBe(initialDataRequests);
  failRefresh = true;
  await page.getByRole("button", { name: "Save & view shortlist" }).click();
  await expect(
    page.getByText("Refresh unavailable", { exact: true }),
  ).toBeVisible();
  expect(dataRequests).toBe(initialDataRequests + 1);
  await expect(page.getByLabel("Bank balance (£m)")).toHaveValue("1.2");
  failRefresh = false;
  await page.getByRole("button", { name: "Save & view shortlist" }).click();
  await expect(shortlistHeading(page)).toBeVisible();
  await expect(page.locator(".workspace-figures")).toContainText("£1.2m");
  expect(dataRequests).toBe(initialDataRequests + 2);
});

test("failed focus refresh does not save subsequent team edits on focus", async ({
  page,
}) => {
  let failRefresh = false;
  let dataRequests = 0;
  await page.route("**/api/data", (route) => {
    dataRequests++;
    return failRefresh
      ? route.fulfill({ status: 503, json: { error: "Refresh unavailable" } })
      : route.fulfill({ json: fixtureData() });
  });
  await importTeam(page);
  await expect(shortlistHeading(page)).toBeVisible();
  const saved = await savedSettingsText(page);
  failRefresh = true;
  await expireData(page);
  await focusWindow(page);
  await expect(
    page.getByText("Refresh unavailable", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Bank balance (£m)").fill("1.2");
  failRefresh = false;
  const requestsBeforeFocus = dataRequests;
  await focusWindow(page);
  await expect(page.getByLabel("Bank balance (£m)")).toHaveValue("1.2");
  expect(dataRequests).toBe(requestsBeforeFocus);
  expect(await savedSettingsText(page)).toBe(saved);
  await page.getByRole("button", { name: "Save & view shortlist" }).click();
  await expect(page.locator(".workspace-figures")).toContainText("£1.2m");
  expect(dataRequests).toBe(requestsBeforeFocus + 1);
});

test("previewing an expired option refreshes the shortlist before using the move", async ({
  page,
}) => {
  let dataRequests = 0;
  await page.route("**/api/data", (route) => {
    dataRequests++;
    const data = fixtureData();
    withPlayer(data, NEW_STAR_INDEX, newDefender);
    return route.fulfill({ json: data });
  });
  await importTeam(page);
  await expect(page.locator(".workspace-horizon")).toBeVisible();
  const initialRequests = dataRequests;
  for (const [index, category] of ["Singles", "Two transfers"].entries()) {
    await page.getByRole("button", { name: category, exact: true }).click();
    await expireData(page, index + 1);
    await page.locator(".preview-toggle").first().click();
    await expect(page.locator(".workspace-horizon")).toBeVisible();
    await expect.poll(() => dataRequests).toBe(initialRequests + index + 1);
    await expect(
      page.getByRole("button", { name: "Singles", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.locator(".preview-toggle[aria-pressed=true]"),
    ).toHaveCount(0);
  }
});
