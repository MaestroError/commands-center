import { expect, test, type Page } from "../fixtures";

const DESKTOP_VIEWPORT = { width: 1280, height: 900 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

test.describe("@design-system protected content baselines", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(({ isMobile }) => Boolean(isMobile), "Snapshots use explicit responsive viewports.");

  for (const theme of ["light", "dark"] as const) {
    test(`${theme} Markdown reader and chat variants`, async ({ page }) => {
      await openBaseline(
        page,
        "/__design-system-baseline?surface=markdown",
        theme,
        DESKTOP_VIEWPORT,
      );

      await expect(page).toHaveScreenshot(`markdown-${theme}-desktop.png`, screenshotOptions());

      await page.setViewportSize(MOBILE_VIEWPORT);
      await expect(page).toHaveScreenshot(`markdown-${theme}-mobile.png`, screenshotOptions());
    });

    test(`${theme} unclassed semantic HTML`, async ({ page }) => {
      await openBaseline(
        page,
        "/__design-system-baseline?surface=semantic",
        theme,
        DESKTOP_VIEWPORT,
      );

      await expect(page).toHaveScreenshot(`semantic-${theme}-desktop.png`, screenshotOptions());

      await page.setViewportSize(MOBILE_VIEWPORT);
      await expect(page).toHaveScreenshot(`semantic-${theme}-mobile.png`, screenshotOptions());
    });

    test(`${theme} Milkdown editor surface`, async ({ page }) => {
      await openBaseline(
        page,
        "/__design-system-baseline?surface=milkdown",
        theme,
        DESKTOP_VIEWPORT,
      );
      await expect(
        page
          .getByTestId("milkdown-editor")
          .locator(".ProseMirror[role='textbox'][contenteditable='true']")
          .first(),
      ).toBeVisible();

      await expect(page).toHaveScreenshot(`milkdown-${theme}-desktop.png`, screenshotOptions());

      await page.setViewportSize(MOBILE_VIEWPORT);
      await expect(page).toHaveScreenshot(`milkdown-${theme}-mobile.png`, screenshotOptions());
    });
  }

  test("Milkdown preserves editing and Markdown serialization", async ({ page }) => {
    await openBaseline(
      page,
      "/__design-system-baseline?surface=milkdown",
      "light",
      DESKTOP_VIEWPORT,
    );
    const editor = page
      .getByTestId("milkdown-editor")
      .locator(".ProseMirror[role='textbox'][contenteditable='true']")
      .first();
    await expect(editor).toBeVisible();

    await editor.press("ControlOrMeta+End");
    await editor.press("Enter");
    await editor.type("Phase zero serialization marker");

    await expect(page.getByTestId("milkdown-output")).toContainText(
      "Phase zero serialization marker",
    );
  });

  test("Milkdown read-only surface is not editable", async ({ page }) => {
    await openBaseline(
      page,
      "/__design-system-baseline?surface=milkdown&readonly=true",
      "light",
      DESKTOP_VIEWPORT,
    );

    await expect(
      page
        .getByTestId("milkdown-editor")
        .locator(".ProseMirror[role='textbox'][contenteditable='false']"),
    ).toBeVisible();

    await expect(page).toHaveScreenshot("milkdown-readonly-light-desktop.png", screenshotOptions());
  });

  test("Milkdown slash menu retains the workspace command", async ({ page }) => {
    await openBaseline(
      page,
      "/__design-system-baseline?surface=milkdown",
      "light",
      DESKTOP_VIEWPORT,
    );
    const editor = page
      .getByTestId("milkdown-editor")
      .locator(".ProseMirror[role='textbox'][contenteditable='true']")
      .first();
    await expect(editor).toBeVisible();

    await editor.locator(":scope > p").last().click();
    await editor.type("/");
    await expect(page.getByText("Workspace file", { exact: true })).toBeVisible();

    await expect(page).toHaveScreenshot(
      "milkdown-slash-menu-light-desktop.png",
      screenshotOptions(),
    );
  });

  test("Milkdown selection remains visible", async ({ page }) => {
    await openBaseline(
      page,
      "/__design-system-baseline?surface=milkdown",
      "light",
      DESKTOP_VIEWPORT,
    );
    const editor = page
      .getByTestId("milkdown-editor")
      .locator(".ProseMirror[role='textbox'][contenteditable='true']")
      .first();
    await expect(editor).toBeVisible();

    await editor.press("ControlOrMeta+End");
    await editor.press("Enter");
    await editor.type("Selection baseline marker");
    await editor.press("Shift+ControlOrMeta+ArrowLeft");

    await expect(page).toHaveScreenshot(
      "milkdown-selection-light-desktop.png",
      screenshotOptions(),
    );
  });
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
