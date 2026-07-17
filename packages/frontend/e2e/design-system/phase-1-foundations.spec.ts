import { expect, test, type Page } from "../fixtures";

const DESKTOP_VIEWPORT = { width: 1280, height: 900 };

test.describe("@design-system Phase 1 foundations", () => {
  test.skip(({ isMobile }) => Boolean(isMobile), "Tests set explicit viewports.");

  test("migrates Modern to Default dark mode before the app renders", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("cc.theme", "modern");
      window.localStorage.removeItem("cc.color-mode");
    });

    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto("/__design-system-baseline?surface=application");

    await expect(page.locator("html")).toHaveAttribute("data-theme", "default");
    await expect(page.locator("html")).toHaveAttribute("data-color-mode", "dark");
    await expect(page.locator("html")).toHaveAttribute("style", /color-scheme: dark/);
  });

  test("tracks operating-system mode only while System is selected", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.addInitScript(() => {
      window.localStorage.setItem("cc.color-mode", "system");
      window.localStorage.removeItem("cc.theme");
    });
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto("/__design-system-baseline?surface=application");

    await expect(page.locator("html")).toHaveAttribute("data-color-mode", "light");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveAttribute("data-color-mode", "dark");

    await page.getByRole("button", { name: "Choose color mode, current: System" }).click();
    await page.getByRole("menuitemradio", { name: "Light" }).click();
    await page.emulateMedia({ colorScheme: "dark" });

    await expect(page.locator("html")).toHaveAttribute("data-color-mode", "light");
  });

  test("keeps the application shell within narrow viewports", async ({ page }) => {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/__design-system-baseline?surface=application");

      expect(await readPageOverflow(page)).toEqual({ clientWidth: width, scrollWidth: width });
    }
  });

  test("applies semantic defaults without overriding protected or utility-styled content", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto("/__design-system-baseline?surface=semantic");

    const colors = await page.evaluate(() => {
      const genericLink = document.querySelector<HTMLElement>(
        "[data-testid='unclassed-html'] a:not([class])",
      );
      const explicitLink = document.querySelector<HTMLElement>(
        "[data-testid='semantic-cascade-control'] a",
      );

      return {
        explicitLink: explicitLink ? getComputedStyle(explicitLink).color : null,
        genericLink: genericLink ? getComputedStyle(genericLink).color : null,
      };
    });

    expect(colors.genericLink).toBe("rgb(29, 78, 216)");
    expect(colors.explicitLink).toBe("rgb(190, 18, 60)");

    await page.goto("/__design-system-baseline?surface=markdown");
    const markdownLink = page.locator(".cc-md:not(.cc-md--chat) a");
    await expect(markdownLink).toHaveCount(1);
    const markdownLinkColor = await markdownLink.evaluate((element) => {
      return getComputedStyle(element).color;
    });

    expect(markdownLinkColor).toBe("rgb(37, 99, 235)");
  });

  test("prevents generic semantic content from overflowing at 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/__design-system-baseline?surface=semantic");

    const dimensions = await page.getByTestId("unclassed-html").evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));

    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  });
});

async function readPageOverflow(page: Page): Promise<{ clientWidth: number; scrollWidth: number }> {
  return page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
}
