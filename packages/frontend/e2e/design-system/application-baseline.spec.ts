import { expect, test, type Page } from "../fixtures";
import {
  expectNoHorizontalOverflow,
  expectSemanticSurface,
  expectThemeContract,
} from "./theme-assertions";

const DESKTOP_VIEWPORT = { width: 1280, height: 900 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

test.describe("@design-system current application baseline", () => {
  test.skip(({ isMobile }) => Boolean(isMobile), "Tests use explicit responsive viewports.");

  for (const theme of ["light", "dark"] as const) {
    test(`${theme} profile surface`, async ({ page }) => {
      await openBaseline(page, "/profile", theme, DESKTOP_VIEWPORT);
      await expect(page.getByRole("heading", { name: "Personalize your workspace" })).toBeVisible();
      await expectThemeContract(page, theme);
      await expectSemanticSurface(page.locator(".cc-panel").first(), theme);
      await expectNoHorizontalOverflow(page);
    });

    test(`${theme} application component surface`, async ({ page }) => {
      await openBaseline(
        page,
        "/__design-system-baseline?surface=application",
        theme,
        DESKTOP_VIEWPORT,
      );
      await page.getByLabel("Text input", { exact: true }).focus();
      await expect(page.getByLabel("Text input", { exact: true })).toBeFocused();
      await expectThemeContract(page, theme);
      await expectSemanticSurface(page.locator(".cc-panel").first(), theme);
      await expectNoHorizontalOverflow(page, page.getByTestId("application-baseline"));

      await page.setViewportSize(MOBILE_VIEWPORT);
      await expectNoHorizontalOverflow(page, page.getByTestId("application-baseline"));
    });

    test(`${theme} confirmation dialog surface`, async ({ page }) => {
      await openBaseline(page, "/__design-system-baseline?surface=dialog", theme, DESKTOP_VIEWPORT);
      const dialog = page.getByRole("alertdialog");
      await expectSemanticSurface(dialog, theme);
      await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();
      await expectNoHorizontalOverflow(page, dialog);

      await page.setViewportSize(MOBILE_VIEWPORT);
      await expectNoHorizontalOverflow(page, dialog);
    });
  }
});

async function openBaseline(
  page: Page,
  path: string,
  colorMode: "light" | "dark",
  viewport: { width: number; height: number },
): Promise<void> {
  await page.setViewportSize(viewport);
  await page.addInitScript((storedColorMode) => {
    window.localStorage.setItem("cc.color-mode", storedColorMode);
    window.localStorage.removeItem("cc.theme");
    window.localStorage.setItem("cc-sidebar-collapsed", "false");
  }, colorMode);
  await page.goto(path);
  await expectThemeContract(page, colorMode);
}
