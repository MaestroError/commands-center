import type { Locator } from "@playwright/test";

import { expect, type Page } from "../fixtures";

export type DesignColorMode = "light" | "dark";

const EXPECTED_THEME = {
  light: {
    appBackground: "#eef2f7",
    surface: "rgb(255, 255, 255)",
    text: "rgb(15, 23, 42)",
  },
  dark: {
    appBackground: "#020817",
    surface: "rgb(15, 23, 42)",
    text: "rgb(226, 232, 240)",
  },
} as const satisfies Record<DesignColorMode, Record<string, string>>;

export async function expectThemeContract(page: Page, colorMode: DesignColorMode): Promise<void> {
  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-theme", "default");
  await expect(root).toHaveAttribute("data-color-mode", colorMode);

  const expected = EXPECTED_THEME[colorMode];
  await expect
    .poll(() =>
      root.evaluate((element) => getComputedStyle(element).getPropertyValue("--app-bg").trim()),
    )
    .toBe(expected.appBackground);
}

export async function expectSemanticSurface(
  locator: Locator,
  colorMode: DesignColorMode,
): Promise<void> {
  const expected = EXPECTED_THEME[colorMode];
  await expect(locator).toBeVisible();
  await expect
    .poll(() => locator.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe(expected.surface);
  await expect
    .poll(() => locator.evaluate((element) => getComputedStyle(element).color))
    .toBe(expected.text);
}

export async function expectNoHorizontalOverflow(page: Page, locator?: Locator): Promise<void> {
  const documentDimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(documentDimensions.scrollWidth).toBeLessThanOrEqual(documentDimensions.clientWidth);

  if (locator) {
    const elementDimensions = await locator.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(elementDimensions.scrollWidth).toBeLessThanOrEqual(elementDimensions.clientWidth);
  }
}
