import { expect, test, type Page } from "../fixtures";

const DESKTOP_VIEWPORT = { width: 1280, height: 900 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

test.describe("@design-system current application baseline", () => {
  test.skip(({ isMobile }) => Boolean(isMobile), "Snapshots use explicit responsive viewports.");

  for (const theme of ["light", "dark"] as const) {
    test(`${theme} profile surface`, async ({ page }) => {
      await openBaseline(page, "/profile", theme, DESKTOP_VIEWPORT);

      await expect(page).toHaveScreenshot(`profile-${theme}-desktop.png`, screenshotOptions());
    });

    test(`${theme} application component surface`, async ({ page }) => {
      await openBaseline(
        page,
        "/__design-system-baseline?surface=application",
        theme,
        DESKTOP_VIEWPORT,
      );
      await page.getByLabel("Text input", { exact: true }).focus();

      await expect(page).toHaveScreenshot(`application-${theme}-desktop.png`, screenshotOptions());

      await page.setViewportSize(MOBILE_VIEWPORT);
      await expect(page).toHaveScreenshot(`application-${theme}-mobile.png`, screenshotOptions());
    });

    test(`${theme} confirmation dialog surface`, async ({ page }) => {
      await openBaseline(page, "/__design-system-baseline?surface=dialog", theme, DESKTOP_VIEWPORT);

      await expect(page).toHaveScreenshot(`dialog-${theme}-desktop.png`, screenshotOptions());

      await page.setViewportSize(MOBILE_VIEWPORT);
      await expect(page).toHaveScreenshot(`dialog-${theme}-mobile.png`, screenshotOptions());
    });
  }
});

async function openBaseline(
  page: Page,
  path: string,
  theme: "light" | "dark",
  viewport: { width: number; height: number },
): Promise<void> {
  await page.setViewportSize(viewport);
  await page.addInitScript((storedTheme) => {
    window.localStorage.setItem("cc.theme", storedTheme);
    window.localStorage.setItem("cc-sidebar-collapsed", "false");
  }, theme);
  await page.goto(path);
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

function screenshotOptions() {
  return {
    animations: "disabled" as const,
    caret: "hide" as const,
    fullPage: true,
  };
}
