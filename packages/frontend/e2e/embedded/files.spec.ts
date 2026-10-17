import { expect, test, type Page } from "@playwright/test";
import { fileManagerFileContentResponseSchema, specialistSchema } from "@cc/shared/schemas";

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.getByTestId("owner-login-password").fill("Local-v2-test-password!");
  await page.getByTestId("owner-login-submit").click();
  await expect(page).not.toHaveURL(/\/login/);
});

async function write(
  page: Page,
  method: "POST" | "PUT",
  url: string,
  data: unknown,
): Promise<unknown> {
  const csrf = (await page.context().cookies()).find((cookie) => cookie.name === "cc_csrf_token");
  const response = await page.request.fetch(url, {
    method,
    data,
    headers: { "x-csrf-token": csrf?.value ?? "", origin: "http://127.0.0.1:4176" },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
async function createFile(page: Page, path: string, content: string): Promise<void> {
  const parts = path.split("/");
  await write(page, "POST", "/api/file-manager/entries", {
    root: "workspace",
    parentPath: parts.slice(0, -1).join("/") || ".",
    name: parts.at(-1),
    type: "file",
  });
  const current = fileManagerFileContentResponseSchema.parse(
    await (
      await page.request.get("/api/file-manager/files/content", {
        params: { root: "workspace", path },
      })
    ).json(),
  );
  await write(page, "PUT", "/api/file-manager/files/content", {
    root: "workspace",
    path,
    content,
    expectedRevision: current.revision,
  });
}

test("opens a text-search result in the file editor", async ({ page }) => {
  await createFile(page, "v2-search-note.txt", "BROWSER_SEARCH_MARKER_42\n");
  await page.keyboard.press("Control+Shift+f");
  await page.getByTestId("global-search-input").fill("BROWSER_SEARCH_MARKER_42");
  await page.getByTestId("global-search-result-file:v2-search-note.txt").click();
  await expect(page.getByTestId("editor-tabs-surface")).toContainText("BROWSER_SEARCH_MARKER_42");
});

test("serves specialist file lookup through the embedded adapter", async ({ page }) => {
  const specialist = specialistSchema.parse(
    await write(page, "POST", "/api/specialists", {
      name: "File Browser",
      role: "File tester",
      instructions: "Test files.",
      defaultModel: "local-e2e/test",
      capabilities: {},
    }),
  );
  await createFile(
    page,
    `specialists/${specialist.slug}/browser.txt`,
    "SPECIALIST_SEARCH_MARKER\n",
  );
  const response = await page.request.get(`/api/specialists/${specialist.id}/workspace/find/file`, {
    params: { query: "browser", type: "file" },
  });
  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual(["browser.txt"]);
});

test("delivers workspace-change events after a file edit", async ({ page }) => {
  const specialist = specialistSchema.parse(
    await write(page, "POST", "/api/specialists", {
      name: "Watch Browser",
      role: "File tester",
      instructions: "Test events.",
      defaultModel: "local-e2e/test",
      capabilities: {},
    }),
  );
  const csrf =
    (await page.context().cookies()).find((cookie) => cookie.name === "cc_csrf_token")?.value ?? "";
  const event = await page.evaluate(
    async ({ id, slug, csrf }) =>
      new Promise<string>((resolve, reject) => {
        const source = new EventSource(`/api/specialists/${id}/workspace/events`);
        const timer = setTimeout(() => {
          source.close();
          reject(new Error("Workspace event timed out"));
        }, 10000);
        source.onmessage = (message) => {
          clearTimeout(timer);
          source.close();
          resolve(String(message.data));
        };
        source.onopen = () => {
          void fetch("/api/file-manager/entries", {
            method: "POST",
            headers: { "content-type": "application/json", "x-csrf-token": csrf },
            body: JSON.stringify({
              root: "workspace",
              parentPath: `specialists/${slug}`,
              name: "watched.txt",
              type: "file",
            }),
          }).then((response) => {
            if (!response.ok) {
              clearTimeout(timer);
              source.close();
              reject(new Error("File creation failed"));
            }
          });
        };
      }),
    { id: specialist.id, slug: specialist.slug, csrf },
  );
  expect(event).toContain("workspace.changed");
});
