import { expect, test, type Page } from "../fixtures";

const DESKTOP_VIEWPORT = { width: 1280, height: 900 };

test.describe("@design-system Phase 5 third-party bridges", () => {
  test.skip(({ isMobile }) => Boolean(isMobile), "Snapshots use an explicit viewport.");

  for (const mode of ["light", "dark"] as const) {
    test(`${mode} Monaco bridge`, async ({ page }) => {
      await openBridge(page, "monaco", mode);
      const editor = page.locator(".monaco-editor");
      await expect(editor).toBeVisible();
      await expect
        .poll(() => editor.evaluate((element) => getComputedStyle(element).backgroundColor))
        .toBe(mode === "light" ? "rgb(255, 255, 255)" : "rgb(15, 23, 42)");
      await expect(page.getByText("ThemeMode", { exact: false }).first()).toBeVisible();
    });
  }

  test("mounted Monaco and Milkdown surfaces update without losing state", async ({ page }) => {
    await openBridge(page, "monaco", "light");
    const monaco = page.locator(".monaco-editor");
    await expect(monaco).toBeVisible();
    await monaco.evaluate((element) => {
      (window as Window & { __ccMonacoElement?: Element }).__ccMonacoElement = element;
    });

    await selectMode(page, "Dark");
    await expect(page.locator("html")).toHaveAttribute("data-color-mode", "dark");
    expect(
      await monaco.evaluate(
        (element) =>
          (window as Window & { __ccMonacoElement?: Element }).__ccMonacoElement === element,
      ),
    ).toBe(true);
    await expect(page.getByText("ThemeMode", { exact: false }).first()).toBeVisible();

    await openBridge(page, "milkdown", "light");
    const editor = page
      .getByTestId("milkdown-editor")
      .locator(".ProseMirror[role='textbox']")
      .first();
    await expect(editor).toBeVisible();
    await editor.press("ControlOrMeta+End");
    await editor.press("Enter");
    await editor.type("Live bridge state");
    await expect(page.getByTestId("milkdown-output")).toContainText("Live bridge state");
    await selectMode(page, "Dark");
    await expect(page.getByTestId("milkdown-output")).toContainText("Live bridge state");
  });

  test("system mode follows operating-system changes on a mounted Monaco editor", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await openBridge(page, "monaco", "system");
    await expect(page.locator("html")).toHaveAttribute("data-color-mode", "light");
    await expect(page.locator(".monaco-editor")).toBeVisible();

    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveAttribute("data-color-mode", "dark");
    await expect(page.locator(".monaco-editor")).toBeVisible();
  });
});

async function openBridge(
  page: Page,
  surface: "milkdown" | "monaco",
  preference: "light" | "dark" | "system",
): Promise<void> {
  await page.setViewportSize(DESKTOP_VIEWPORT);
  await page.addInitScript((storedPreference) => {
    window.localStorage.setItem("cc.color-mode", storedPreference);
    window.localStorage.removeItem("cc.theme");
  }, preference);
  await page.goto(`/__design-system-baseline?surface=${surface}`);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "default");
}

async function selectMode(page: Page, label: "Light" | "Dark" | "System"): Promise<void> {
  await page.getByRole("button", { name: /Choose color mode, current:/ }).click();
  await page.getByRole("menuitemradio", { name: label }).click();
}
