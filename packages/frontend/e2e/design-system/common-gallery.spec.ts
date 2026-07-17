import { expect, test, type Page } from "../fixtures";

const DESKTOP_VIEWPORT = { width: 1280, height: 900 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

test.describe("@design-system Phase 3 common compositions", () => {
  test.skip(({ isMobile }) => Boolean(isMobile), "Tests set explicit viewports.");

  for (const colorMode of ["light", "dark"] as const) {
    test(`${colorMode} common gallery`, async ({ page }) => {
      await openCommon(page, colorMode, DESKTOP_VIEWPORT);

      await expect(page).toHaveScreenshot(`common-${colorMode}-desktop.png`, screenshotOptions());

      await page.setViewportSize(MOBILE_VIEWPORT);
      await expect(page).toHaveScreenshot(`common-${colorMode}-mobile.png`, screenshotOptions());
    });
  }

  test("password, switch, and tab keyboard behavior remains integrated", async ({ page }) => {
    await openCommon(page, "light", DESKTOP_VIEWPORT);

    const password = page.getByLabel("Workspace token");
    await expect(password).toHaveAttribute("type", "password");
    await password.locator("..").getByRole("button", { name: "Show password" }).click();
    await expect(password).toHaveAttribute("type", "text");

    const toolsSwitch = page.getByRole("switch", { name: "Enable tools" });
    await expect(toolsSwitch).toHaveAttribute("data-state", "checked");
    await toolsSwitch.focus();
    await page.keyboard.press("Space");
    await expect(toolsSwitch).toHaveAttribute("data-state", "unchecked");
    await page.keyboard.press("Enter");
    await expect(toolsSwitch).toHaveAttribute("data-state", "checked");

    const overview = page.getByRole("tab", { name: "Overview" });
    await overview.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Search" })).toBeFocused();
    await expect(page.getByRole("tabpanel")).toContainText("Search panel content");
    await page.keyboard.press("End");
    await expect(page.getByRole("tab", { name: "Activity" })).toBeFocused();
    await page.keyboard.press("Home");
    await expect(overview).toBeFocused();
  });

  test("searchable select filters, selects, dismisses, and returns focus", async ({ page }) => {
    await openCommon(page, "light", DESKTOP_VIEWPORT);

    const input = page.getByRole("combobox", { name: "Default model" });
    await input.focus();
    await expect(page.getByRole("listbox")).toBeVisible();
    await input.fill("sonnet");
    await expect(page.getByRole("option", { name: "Claude Sonnet 4.6" })).toBeVisible();
    await expect(page.getByRole("option", { name: "GPT-4.1" })).toBeHidden();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(input).toHaveValue("Claude Sonnet 4.6");
    await expect(input).toBeFocused();

    await input.fill("opus");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toBeHidden();
    await expect(input).toHaveValue("Claude Sonnet 4.6");

    await input.focus();
    await page.getByRole("heading", { name: "Controls" }).click();
    await expect(page.getByRole("listbox")).toBeHidden();
  });

  test("confirmation and document dialogs preserve dismissal and focus contracts", async ({
    page,
  }) => {
    await openCommon(page, "light", DESKTOP_VIEWPORT);

    const destructiveTrigger = page.getByRole("button", { name: "Delete specialist" });
    await destructiveTrigger.click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.mouse.click(5, 5);
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog")).toBeHidden();
    await expect(destructiveTrigger).toBeFocused();

    const documentTrigger = page.getByRole("button", { name: "Open document dialog" });
    await documentTrigger.click();
    await expect(page.getByRole("dialog", { name: "New Document" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Title", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "New Document" })).toBeHidden();
    await expect(documentTrigger).toBeFocused();

    const folderTrigger = page.getByRole("button", { name: "Open folder dialog" });
    await folderTrigger.click();
    await expect(page.getByRole("dialog", { name: "New Folder" })).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(page.getByRole("dialog", { name: "New Folder" })).toBeHidden();
    await expect(folderTrigger).toBeFocused();
  });

  test("popup and dialog stay contained at 320px", async ({ page }) => {
    await openCommon(page, "light", { width: 320, height: 844 });

    const input = page.getByRole("combobox", { name: "Default model" });
    await input.focus();
    await expect(page.getByRole("listbox")).toBeVisible();
    await expect(page).toHaveScreenshot("common-select-light-narrow.png", screenshotOptions());
    await assertNoHorizontalOverflow(page);

    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Open document dialog" }).click();
    await expect(page.getByRole("dialog", { name: "New Document" })).toBeVisible();
    await expect(page).toHaveScreenshot("common-document-light-narrow.png", screenshotOptions());
    await assertNoHorizontalOverflow(page);
  });
});

async function openCommon(
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
  await page.goto("/__design-system-baseline?surface=common");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "default");
  await expect(page.locator("html")).toHaveAttribute("data-color-mode", colorMode);
  await expect(page.getByTestId("common-baseline")).toBeVisible();
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

function screenshotOptions() {
  return {
    animations: "disabled" as const,
    caret: "hide" as const,
    fullPage: true,
  };
}
