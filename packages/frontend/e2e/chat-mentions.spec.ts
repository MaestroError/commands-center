import { createChatState, mockChatApi } from "./app-fixtures";
import { expect, test, type Route } from "./fixtures";

function jsonRoute(route: Route, body: unknown): Promise<void> {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

test.describe("chat file mentions", { tag: "@chat" }, () => {
  test("opens the mention popover above the composer and mentions a global document", async ({
    page,
  }) => {
    const state = createChatState();
    await mockChatApi(page, state);

    // Specialist scope: no workspace file matches, one global document match.
    await page.route("**/api/specialists/*/workspace/find/file*", (route) => jsonRoute(route, []));
    await page.route("**/api/documents/search*", (route) =>
      jsonRoute(route, {
        documents: [
          {
            scope: "global",
            ownerSlug: null,
            relativePath: "design/overview.md",
            fullPath: "/workspace/Documents/design/overview.md",
            title: "Architecture Overview",
            description: null,
            author: null,
          },
        ],
      }),
    );

    await page.goto("/chat/planner");

    const textarea = page.getByPlaceholder(/Type a message/);
    await textarea.click();
    await textarea.fill("#overview");

    // The popover and the global-document option render.
    const header = page.getByText("File mention", { exact: true });
    await expect(header).toBeVisible();
    const option = page.getByRole("button", { name: /Architecture Overview/ });
    await expect(option).toBeVisible();
    await expect(page.getByText("Global Document: design/overview.md")).toBeVisible();

    // Regression guard: the popover opens *above* the input (not clipped below it),
    // and stays within the viewport.
    const headerBox = await header.boundingBox();
    const textareaBox = await textarea.boundingBox();
    expect(headerBox).not.toBeNull();
    expect(textareaBox).not.toBeNull();
    expect(headerBox!.y).toBeGreaterThanOrEqual(0);
    expect(headerBox!.y).toBeLessThan(textareaBox!.y);

    // Selecting the option turns it into a distinct global-document chip and
    // strips the "#overview" query from the textarea.
    await option.click();
    await expect(page.getByText("Global Document:", { exact: true })).toBeVisible();
    await expect(page.getByTitle("Global Document: design/overview.md")).toBeVisible();
    await expect(textarea).toHaveValue("");
  });
});
