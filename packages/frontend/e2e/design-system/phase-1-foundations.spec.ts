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

  test("keeps every global action reachable and preserves shell keyboard behavior", async ({
    page,
  }) => {
    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/__design-system-baseline?surface=application");

      const navigation = page.getByRole("button", { name: "Open navigation" });
      if (width < 1024) {
        await expect(navigation).toBeVisible();
      } else {
        await expect(navigation).toHaveCount(0);
      }

      const search = page.getByRole("button", { name: "Open global search" });
      const appearance = page.getByRole("button", { name: /Choose color mode, current:/ });
      const activity = page.getByRole("button", { name: "Activity", exact: true });
      const profile = page.getByRole("link", { name: "Profile" });

      await expect(search).toBeVisible();
      await expect(appearance).toBeVisible();
      await expect(activity).toBeVisible();
      await expect(profile).toBeVisible();

      await appearance.focus();
      await page.keyboard.press("Enter");
      await page.keyboard.type("s");
      await expect(page.getByRole("menuitemradio", { name: "System" })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(appearance).toBeFocused();

      await activity.click();
      await expect(page.getByText("Needs attention")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByText("Needs attention")).toHaveCount(0);

      await page.keyboard.press("Control+Shift+F");
      await expect(page.getByRole("dialog", { name: "Global search" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: "Global search" })).toHaveCount(0);

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

  test("preserves unclassed heading hierarchy", async ({ page }) => {
    await openSemanticBaseline(page);

    const headings = await page
      .getByTestId("unclassed-html")
      .locator("h1, h2, h3, h4, h5, h6")
      .evaluateAll((elements) =>
        elements.slice(0, 6).map((element) => {
          const style = getComputedStyle(element);
          return {
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            lineHeight: style.lineHeight,
          };
        }),
      );

    expect(headings).toEqual([
      { fontSize: "40px", fontWeight: "600", lineHeight: "48px" },
      { fontSize: "32px", fontWeight: "600", lineHeight: "38.4px" },
      { fontSize: "22px", fontWeight: "600", lineHeight: "26.4px" },
      { fontSize: "18px", fontWeight: "600", lineHeight: "21.6px" },
      { fontSize: "16px", fontWeight: "600", lineHeight: "19.2px" },
      { fontSize: "16px", fontWeight: "600", lineHeight: "19.2px" },
    ]);
  });

  test("preserves unclassed paragraph rhythm", async ({ page }) => {
    await openSemanticBaseline(page);

    const paragraphs = await page
      .getByTestId("unclassed-html")
      .locator(":scope > p")
      .evaluateAll((elements) =>
        elements.map((element) => {
          const style = getComputedStyle(element);
          return {
            lineHeight: style.lineHeight,
            marginTop: style.marginTop,
            overflowWrap: style.overflowWrap,
          };
        }),
      );

    expect(paragraphs[0]).toEqual({
      lineHeight: "25.6px",
      marginTop: "0px",
      overflowWrap: "anywhere",
    });
    expect(paragraphs[1]).toEqual({
      lineHeight: "25.6px",
      marginTop: "16px",
      overflowWrap: "anywhere",
    });
  });

  test("preserves unclassed list presentation", async ({ page }) => {
    await openSemanticBaseline(page);
    const content = page.getByTestId("unclassed-html");

    const styles = await content.evaluate((element) => {
      const unordered = element.querySelector("ul");
      const ordered = element.querySelector("ol");
      const item = element.querySelector("ul > li");
      if (!unordered || !ordered || !item) {
        return null;
      }
      return {
        itemMargin: getComputedStyle(item).marginBlock,
        markerColor: getComputedStyle(item, "::marker").color,
        orderedStyle: getComputedStyle(ordered).listStyleType,
        unorderedPadding: getComputedStyle(unordered).paddingLeft,
        unorderedStyle: getComputedStyle(unordered).listStyleType,
      };
    });

    expect(styles).toEqual({
      itemMargin: "5.6px",
      markerColor: "rgb(37, 99, 235)",
      orderedStyle: "decimal",
      unorderedPadding: "24px",
      unorderedStyle: "disc",
    });
  });

  test("preserves unclassed description-list presentation", async ({ page }) => {
    await openSemanticBaseline(page);
    const descriptionList = page.getByTestId("unclassed-html").locator(":scope > dl");

    expect(
      await descriptionList.evaluate((element) => {
        const term = element.querySelector("dt");
        const value = element.querySelector("dd");
        return {
          display: getComputedStyle(element).display,
          gap: getComputedStyle(element).gap,
          termFontWeight: term ? getComputedStyle(term).fontWeight : null,
          valueMargin: value ? getComputedStyle(value).marginLeft : null,
          valueOverflowWrap: value ? getComputedStyle(value).overflowWrap : null,
        };
      }),
    ).toEqual({
      display: "grid",
      gap: "12px",
      termFontWeight: "500",
      valueMargin: "0px",
      valueOverflowWrap: "anywhere",
    });
  });

  test("preserves unclassed quote presentation", async ({ page }) => {
    await openSemanticBaseline(page);

    expect(
      await page
        .getByTestId("unclassed-html")
        .locator("blockquote")
        .evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            borderLeftWidth: style.borderLeftWidth,
            color: style.color,
            paddingLeft: style.paddingLeft,
          };
        }),
    ).toEqual({ borderLeftWidth: "3px", color: "rgb(71, 85, 105)", paddingLeft: "16px" });
  });

  test("preserves unclassed code presentation", async ({ page }) => {
    await openSemanticBaseline(page);
    const content = page.getByTestId("unclassed-html");

    expect(
      await content.evaluate((element) => {
        const pre = element.querySelector("pre");
        const blockCode = element.querySelector("pre code");
        const inlineCode = element.querySelector("p code");
        const keyboard = element.querySelector("kbd");
        if (!pre || !blockCode || !inlineCode || !keyboard) {
          return null;
        }
        return {
          blockBackground: getComputedStyle(blockCode).backgroundColor,
          inlineBackground: getComputedStyle(inlineCode).backgroundColor,
          inlineBorderWidth: getComputedStyle(inlineCode).borderTopWidth,
          keyboardBackground: getComputedStyle(keyboard).backgroundColor,
          overflowX: getComputedStyle(pre).overflowX,
        };
      }),
    ).toEqual({
      blockBackground: "rgba(0, 0, 0, 0)",
      inlineBackground: "rgb(219, 234, 254)",
      inlineBorderWidth: "1px",
      keyboardBackground: "rgb(248, 250, 252)",
      overflowX: "auto",
    });
  });

  test("preserves unclassed table presentation", async ({ page }) => {
    await openSemanticBaseline(page);
    const table = page.getByTestId("unclassed-html").locator(":scope > table");

    expect(
      await table.evaluate((element) => {
        const caption = element.querySelector("caption");
        const header = element.querySelector("th");
        const cell = element.querySelector("td");
        const footer = element.querySelector("tfoot");
        return {
          captionSide: caption ? getComputedStyle(caption).captionSide : null,
          cellPadding: cell ? getComputedStyle(cell).padding : null,
          display: getComputedStyle(element).display,
          footerColor: footer ? getComputedStyle(footer).color : null,
          headerAlign: header ? getComputedStyle(header).textAlign : null,
          overflowX: getComputedStyle(element).overflowX,
        };
      }),
    ).toEqual({
      captionSide: "bottom",
      cellPadding: "12px 16px",
      display: "block",
      footerColor: "rgb(71, 85, 105)",
      headerAlign: "left",
      overflowX: "auto",
    });
  });

  test("preserves unclassed inline semantics", async ({ page }) => {
    await openSemanticBaseline(page);
    const paragraph = page.getByTestId("unclassed-html").locator(":scope > p").first();

    expect(
      await paragraph.evaluate((element) => {
        const small = element.querySelector("small");
        const mark = element.querySelector("mark");
        const insertion = element.querySelector("ins");
        const deletion = element.querySelector("del");
        return {
          deletionColor: deletion ? getComputedStyle(deletion).color : null,
          insertionColor: insertion ? getComputedStyle(insertion).color : null,
          markBackground: mark ? getComputedStyle(mark).backgroundColor : null,
          smallFontSize: small ? getComputedStyle(small).fontSize : null,
        };
      }),
    ).toEqual({
      deletionColor: "rgb(71, 85, 105)",
      insertionColor: "rgb(22, 101, 52)",
      markBackground: "rgb(255, 251, 235)",
      smallFontSize: "14px",
    });
  });

  test("preserves unclassed media containment", async ({ page }) => {
    await openSemanticBaseline(page);

    expect(
      await page.getByRole("img", { name: "CC semantic baseline" }).evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          borderWidth: style.borderTopWidth,
          height: style.height,
          maxWidth: style.maxWidth,
        };
      }),
    ).toEqual({ borderWidth: "1px", height: "32px", maxWidth: "100%" });
  });

  test("preserves unclassed separator presentation", async ({ page }) => {
    await openSemanticBaseline(page);

    expect(
      await page
        .getByTestId("unclassed-html")
        .locator("hr")
        .evaluate((element) => {
          const style = getComputedStyle(element);
          return { borderTopWidth: style.borderTopWidth, marginBlock: style.marginBlock };
        }),
    ).toEqual({ borderTopWidth: "1px", marginBlock: "32px" });
  });

  test("keeps classed content outside semantic defaults", async ({ page }) => {
    await openSemanticBaseline(page);

    const controls = await page.evaluate(() => {
      const listItem = document.querySelector("[data-testid='classed-list-control'] li");
      const descriptionList = document.querySelector(
        "[data-testid='classed-description-list-control']",
      );
      const descriptionTerm = descriptionList?.querySelector("dt");
      const table = document.querySelector("[data-testid='classed-table-control']");
      const cell = table?.querySelector("td");
      return {
        descriptionDisplay: descriptionList ? getComputedStyle(descriptionList).display : null,
        descriptionTermWeight: descriptionTerm
          ? getComputedStyle(descriptionTerm).fontWeight
          : null,
        listItemMargin: listItem ? getComputedStyle(listItem).marginBlock : null,
        tableCellBorder: cell ? getComputedStyle(cell).borderTopWidth : null,
        tableCellPadding: cell ? getComputedStyle(cell).padding : null,
        tableDisplay: table ? getComputedStyle(table).display : null,
      };
    });

    expect(controls).toEqual({
      descriptionDisplay: "block",
      descriptionTermWeight: "400",
      listItemMargin: "0px",
      tableCellBorder: "0px",
      tableCellPadding: "0px",
      tableDisplay: "table",
    });
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

async function openSemanticBaseline(page: Page): Promise<void> {
  await page.setViewportSize(DESKTOP_VIEWPORT);
  await page.addInitScript(() => {
    window.localStorage.setItem("cc.color-mode", "light");
    window.localStorage.removeItem("cc.theme");
  });
  await page.goto("/__design-system-baseline?surface=semantic");
}
