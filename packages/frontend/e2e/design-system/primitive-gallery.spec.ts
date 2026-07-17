import { expect, test, type Page } from "../fixtures";

const DESKTOP_VIEWPORT = { width: 1280, height: 900 };

test.describe("@design-system Phase 2 primitives", () => {
  test.skip(({ isMobile }) => Boolean(isMobile), "Tests set explicit viewports.");

  for (const theme of ["light", "dark"] as const) {
    test(`${theme} primitive gallery and open overlays`, async ({ page }) => {
      await openPrimitives(page, theme, DESKTOP_VIEWPORT);

      await expect(page).toHaveScreenshot(`primitives-${theme}-desktop.png`, screenshotOptions());

      await page.getByRole("button", { name: "Open dialog" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page).toHaveScreenshot(
        `primitives-dialog-${theme}-desktop.png`,
        screenshotOptions(),
      );
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toBeHidden();

      await page.getByRole("button", { name: "Open destructive alert" }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await expect(page).toHaveScreenshot(
        `primitives-alert-${theme}-desktop.png`,
        screenshotOptions(),
      );
    });
  }

  test("ordinary dialog closes on Escape and outside click, returning focus", async ({ page }) => {
    await openPrimitives(page, "light", DESKTOP_VIEWPORT);
    const trigger = page.getByRole("button", { name: "Open dialog" });

    await trigger.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const overlay = dialog.locator("xpath=preceding-sibling::*[1]");
    await overlay.click({ position: { x: 5, y: 5 } });
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("dialog contains keyboard focus while open", async ({ page }) => {
    await openPrimitives(page, "light", DESKTOP_VIEWPORT);
    await page.getByRole("button", { name: "Open dialog" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press("Tab");
    }

    const contained = await page.evaluate(
      () => document.querySelector('[role="dialog"]')?.contains(document.activeElement) ?? false,
    );
    expect(contained).toBe(true);
  });

  test("destructive alert focuses the safe action and resists overlay dismissal", async ({
    page,
  }) => {
    await openPrimitives(page, "light", DESKTOP_VIEWPORT);
    const trigger = page.getByRole("button", { name: "Open destructive alert" });

    await trigger.click();
    const alert = page.getByRole("alertdialog");
    await expect(alert).toBeVisible();

    // Safe initial focus: the Cancel action, never the destructive one.
    await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();

    // An outside click must not dismiss a destructive confirmation.
    await page.mouse.click(5, 5);
    await expect(alert).toBeVisible();

    // Escape routes to cancel and returns focus to the trigger.
    await page.keyboard.press("Escape");
    await expect(alert).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("controlled dialog closes through its owning state", async ({ page }) => {
    await openPrimitives(page, "light", DESKTOP_VIEWPORT);
    await page.getByRole("button", { name: "Open controlled dialog" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("disabled destructive action is not activatable", async ({ page }) => {
    await openPrimitives(page, "light", DESKTOP_VIEWPORT);
    await page.getByRole("button", { name: "Open disabled alert" }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete permanently" })).toBeDisabled();
  });

  test("dropdown menu supports keyboard navigation and returns focus on Escape", async ({
    page,
  }) => {
    await openPrimitives(page, "light", DESKTOP_VIEWPORT);
    const trigger = page.getByRole("button", { name: "Open menu" });

    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Rename" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Duplicate" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Duplicate" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("dropdown radio menu selects a value", async ({ page }) => {
    await openPrimitives(page, "light", DESKTOP_VIEWPORT);
    await page.getByRole("button", { name: "Radio menu" }).click();
    await expect(page.getByRole("menuitemradio", { name: "System" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await page.getByRole("menuitemradio", { name: "Dark" }).click();
    await expect(page.getByRole("menu")).toBeHidden();

    await page.getByRole("button", { name: "Radio menu" }).click();
    await expect(page.getByRole("menuitemradio", { name: "Dark" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  test("tri-state checkbox exposes and changes its mixed state", async ({ page }) => {
    await openPrimitives(page, "light", DESKTOP_VIEWPORT);
    const checkbox = page.getByRole("checkbox", { name: "Permission group" });

    await expect(checkbox).toHaveAttribute("data-state", "indeterminate");
    await checkbox.click();
    await expect(checkbox).toBeChecked();
  });

  for (const width of [320, 390]) {
    test(`open dialog stays within a ${width}px viewport`, async ({ page }) => {
      await openPrimitives(page, "light", { width, height: 844 });
      await page.getByRole("button", { name: "Open dialog" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();

      const dimensions = await page.evaluate(() => {
        const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
        return {
          documentClientWidth: document.documentElement.clientWidth,
          documentScrollWidth: document.documentElement.scrollWidth,
          dialogClientWidth: dialog?.clientWidth ?? 0,
          dialogScrollWidth: dialog?.scrollWidth ?? 0,
        };
      });

      expect(dimensions.documentScrollWidth).toBeLessThanOrEqual(dimensions.documentClientWidth);
      expect(dimensions.dialogScrollWidth).toBeLessThanOrEqual(dimensions.dialogClientWidth);
    });
  }
});

async function openPrimitives(
  page: Page,
  colorMode: "light" | "dark",
  viewport: { width: number; height: number },
): Promise<void> {
  await page.setViewportSize(viewport);
  await page.addInitScript((storedColorMode) => {
    window.localStorage.setItem("cc.color-mode", storedColorMode);
    window.localStorage.removeItem("cc.theme");
    window.localStorage.setItem("cc-sidebar-collapsed", "false");
  }, colorMode);
  await page.goto("/__design-system-baseline?surface=primitives");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "default");
  await expect(page.locator("html")).toHaveAttribute("data-color-mode", colorMode);
}

function screenshotOptions() {
  return {
    animations: "disabled" as const,
    caret: "hide" as const,
    fullPage: true,
  };
}
