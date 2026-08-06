import { expect, test, type Page } from "../fixtures";
import {
  expectNoHorizontalOverflow,
  expectSemanticSurface,
  expectThemeContract,
} from "./theme-assertions";

const DESKTOP_VIEWPORT = { width: 1280, height: 900 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

test.describe("@design-system protected content baselines", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(({ isMobile }) => Boolean(isMobile), "Tests use explicit responsive viewports.");

  for (const theme of ["light", "dark"] as const) {
    test(`${theme} Markdown reader and chat variants`, async ({ page }) => {
      await openBaseline(
        page,
        "/__design-system-baseline?surface=markdown",
        theme,
        DESKTOP_VIEWPORT,
      );
      const baseline = page.getByTestId("markdown-baseline");
      await expectSemanticSurface(baseline.locator(".cc-panel").first(), theme);
      await expect(page.getByRole("heading", { name: "Reader heading" }).first()).toBeVisible();
      await expect(page.getByRole("link", { name: "an external link" }).first()).toBeVisible();
      await expectNoHorizontalOverflow(page, baseline);

      await page.setViewportSize(MOBILE_VIEWPORT);
      await expectNoHorizontalOverflow(page, baseline);
    });

    test(`${theme} unclassed semantic HTML`, async ({ page }) => {
      await openBaseline(
        page,
        "/__design-system-baseline?surface=semantic",
        theme,
        DESKTOP_VIEWPORT,
      );
      const baseline = page.getByTestId("semantic-baseline");
      await expectSemanticSurface(baseline, theme);
      await expect(page.getByTestId("unclassed-html").getByRole("heading").first()).toBeVisible();
      await expect(
        page.getByTestId("unclassed-html").getByRole("table", { name: "Plain semantic table" }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page, baseline);

      await page.setViewportSize(MOBILE_VIEWPORT);
      await expectNoHorizontalOverflow(page, baseline);
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
      await expectMilkdownTheme(page, theme);
      await page.setViewportSize(MOBILE_VIEWPORT);
      await expectMilkdownContainment(page);
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

    const readonlyEditor = page
      .getByTestId("milkdown-editor")
      .locator(".ProseMirror[role='textbox'][contenteditable='false']");
    await expect(readonlyEditor).toHaveCount(1);
    await expect(readonlyEditor).toBeVisible();

    await expectMilkdownTheme(page, "light");
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

    await expectMilkdownTheme(page, "light");
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

    await expect
      .poll(() =>
        page.evaluate(() => {
          const selection = window.getSelection();
          return selection?.isCollapsed === false && selection.toString().includes("marker");
        }),
      )
      .toBe(true);
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
  await expectThemeContract(page, colorMode);
}

async function expectMilkdownTheme(page: Page, colorMode: "light" | "dark"): Promise<void> {
  const milkdown = page.getByTestId("milkdown-editor").locator(".milkdown").first();
  await expect
    .poll(() => milkdown.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe(colorMode === "light" ? "rgb(255, 255, 255)" : "rgb(15, 23, 42)");
  await expect
    .poll(() => milkdown.evaluate((element) => getComputedStyle(element).color))
    .toBe(colorMode === "light" ? "rgb(15, 23, 42)" : "rgb(226, 232, 240)");
}

async function expectMilkdownContainment(page: Page): Promise<void> {
  const editor = page.getByTestId("milkdown-editor");
  expect(await editor.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
}
