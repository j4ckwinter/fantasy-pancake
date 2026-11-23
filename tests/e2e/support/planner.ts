import { expect, type Page } from "@playwright/test";

const STORAGE_KEY = "fpl-planner-v1";
const SAVE_AND_VIEW_SHORTLIST = /^(Save & view shortlist|View shortlist)/;

export async function importTeam(page: Page) {
  await page.goto("/");
  await page.getByLabel("FPL team ID").fill("123");
  await page.getByRole("button", { name: "Import team" }).click();
}

export function shortlistHeading(page: Page) {
  return page.getByRole("heading", {
    name: "Your transfer shortlist",
    exact: true,
  });
}

export function saveShortlistButton(page: Page) {
  return page.getByRole("button", { name: SAVE_AND_VIEW_SHORTLIST });
}

export async function saveAndViewShortlist(page: Page) {
  await saveShortlistButton(page).click();
}

export async function openCustomComparison(page: Page) {
  if (!(await page.getByLabel("Player to sell").isVisible())) {
    await page.locator("#planner-compare > summary").click();
  }
}

export async function chooseIncoming(page: Page, name: string) {
  await page.getByRole("combobox", { name: "Player to buy" }).fill(name);
  await page.getByRole("option", { name: new RegExp(name) }).click();
}

export async function compareTransfer(
  page: Page,
  outgoingId: string,
  incoming: string,
) {
  await openCustomComparison(page);
  await page.getByLabel("Player to sell").selectOption(outgoingId);
  await chooseIncoming(page, incoming);
  await page.getByRole("button", { name: "Compare my transfer" }).click();
}

export async function replaceSquadPlayer(
  page: Page,
  outgoing: string,
  incoming: string,
) {
  await page
    .getByRole("button", { name: `Replace ${outgoing}`, exact: true })
    .click();
  await page
    .getByRole("combobox", { name: `Replacement for ${outgoing}`, exact: true })
    .fill(incoming);
  await page.getByRole("option", { name: new RegExp(incoming) }).click();
}

export async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

export async function savedSettingsText(page: Page) {
  return page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
}

export async function savedSettings(page: Page) {
  return JSON.parse((await savedSettingsText(page))!);
}

export async function removeSavedTeamName(page: Page) {
  await page.evaluate((key) => {
    const saved = JSON.parse(localStorage.getItem(key)!);
    delete saved.teamName;
    localStorage.setItem(key, JSON.stringify(saved));
  }, STORAGE_KEY);
}

export async function seedSavedSettings(page: Page, text: string) {
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    [STORAGE_KEY, text],
  );
}

export function gate() {
  let release: () => void = () => {};
  const opened = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { opened, release };
}
