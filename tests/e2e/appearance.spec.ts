import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { importTeam, shortlistHeading } from "./support/planner";

const TOUCH_TARGET = 40;

async function smallTouchTargets(page: Page) {
  const small: string[] = [];
  for (const target of await page
    .locator('[data-slot="button"]:not([data-variant="link"]):visible')
    .all()) {
    const box = await target.boundingBox();
    if (box && box.height < TOUCH_TARGET)
      small.push(
        `${(await target.getAttribute("aria-label")) ?? (await target.innerText())} ${Math.round(box.height)}px`,
      );
  }
  return small;
}

async function lowContrastText(page: Page) {
  return page.evaluate(() => {
    const channel = (value: number) => {
      const c = value / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const parse = (colour: string) => {
      const probe = document.createElement("canvas").getContext("2d")!;
      probe.clearRect(0, 0, 1, 1);
      probe.fillStyle = colour;
      probe.fillRect(0, 0, 1, 1);
      return [...probe.getImageData(0, 0, 1, 1).data];
    };
    const luminance = ([r, g, b]: number[]) =>
      0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    const backgroundOf = (element: Element | null): string => {
      for (let node = element; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.backgroundImage !== "none") return "";
        const [, , , alpha] = parse(style.backgroundColor);
        if (alpha === 255) return style.backgroundColor;
      }
      return getComputedStyle(document.body).backgroundColor;
    };
    const failures: string[] = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      const element = text.parentElement;
      if (!element || !text.textContent?.trim()) continue;
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (
        !box.width ||
        style.visibility === "hidden" ||
        style.opacity === "0" ||
        element.closest('[aria-hidden="true"], [disabled], .sr-only')
      )
        continue;
      const background = backgroundOf(element);
      if (!background) continue;
      const fg = luminance(parse(style.color));
      const bg = luminance(parse(background));
      const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
      const size = parseFloat(style.fontSize);
      const large =
        size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5))
        failures.push(
          `${text.textContent.trim().slice(0, 40)} · ${ratio.toFixed(2)}`,
        );
    }
    return [...new Set(failures)];
  });
}

test.describe("on a touch screen", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test("buttons are at least 40px tall on the landing page, shortlist and team review", async ({
    page,
  }) => {
    await page.goto("/");
    expect(await smallTouchTargets(page)).toEqual([]);
    await importTeam(page);
    await expect(shortlistHeading(page)).toBeVisible();
    expect(await smallTouchTargets(page)).toEqual([]);
    await page.getByRole("button", { name: "Edit team details" }).click();
    await page.getByRole("button", { name: "Edit team", exact: true }).click();
    expect(await smallTouchTargets(page)).toEqual([]);
  });
});

for (const scheme of ["light", "dark"] as const) {
  test(`text stays readable in the ${scheme} colour scheme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/");
    expect(await lowContrastText(page)).toEqual([]);
    await importTeam(page);
    await expect(shortlistHeading(page)).toBeVisible();
    expect(await lowContrastText(page)).toEqual([]);
    await page
      .getByRole("button", { name: /Preview Player .* to New Star/ })
      .first()
      .click();
    expect(await lowContrastText(page)).toEqual([]);
    await page.getByRole("button", { name: "Edit team details" }).click();
    await page.getByRole("button", { name: "Edit team", exact: true }).click();
    expect(await lowContrastText(page)).toEqual([]);
  });
}
