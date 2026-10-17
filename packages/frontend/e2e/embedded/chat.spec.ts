import { expect, test, type Page } from "@playwright/test";
import { fileManagerFileContentResponseSchema } from "@cc/shared/schemas";

async function createSpecialist(page: Page, name: string): Promise<void> {
  await page.goto("/specialists/new");
  await page.getByTestId("owner-login-password").fill("Local-v2-test-password!");
  await page.getByTestId("owner-login-submit").click();
  await expect(page).not.toHaveURL(/\/login/);
  await page.goto("/specialists/new");
  await page.getByTestId("specialist-name").fill(name);
  await page.getByTestId("specialist-role").fill("Local integration tester");
  await page
    .getByTestId("specialist-instructions")
    .fill("CC_LOCAL_E2E_INSTRUCTIONS: answer the user's request.");
  await page.getByTestId("specialist-model").click();
  await page.getByRole("option", { name: "local-e2e/test", exact: true }).click();
  await page.getByTestId("specialist-submit").click();
  await expect(page).toHaveURL(/\/specialists$/);
  await page.goto(`/chat/${name.toLowerCase().replaceAll(" ", "-")}`);
  await expect(page.getByTestId("chat-message-input")).toBeVisible();
}

async function send(page: Page, text: string): Promise<void> {
  await page.getByTestId("chat-message-input").fill(text);
  await page.getByTestId("chat-send").click();
  await expect(page.getByText("Local v2 response.", { exact: true })).toBeVisible();
}

test("receives a provider response over the real chat event stream", async ({ page }) => {
  const events = page.waitForResponse(
    (response) =>
      response.url().includes("/events") &&
      response.headers()["content-type"]?.includes("text/event-stream") === true,
  );
  await createSpecialist(page, "Browser Chat");
  await send(page, "Reply to this local E2E message.");
  expect((await events).ok()).toBe(true);
});

test("uses updated specialist instructions after reloading the embedded runtime", async ({
  page,
}) => {
  await createSpecialist(page, "Browser Update");
  await send(page, "Respond before the update.");
  await page.goto("/specialists/browser-update/edit");
  await page.getByTestId("specialist-instructions").fill("CC_UPDATED_INSTRUCTIONS_MARKER");
  await page.getByRole("checkbox", { name: "Rewrite AGENTS.md on save" }).check();
  await page.getByTestId("specialist-submit").click();
  await expect(page).toHaveURL(/\/specialists$/);
  await page.goto("/chat/browser-update");
  const prompted = page.waitForResponse(
    (response) => response.url().includes("/prompt?") && response.request().method() === "POST",
  );
  await page.getByTestId("chat-message-input").fill("Respond after the update.");
  await page.getByTestId("chat-send").click();
  expect((await prompted).ok()).toBe(true);
  await expect(page.getByText("Local v2 response.", { exact: true })).toHaveCount(2);
  const requests = await page.request.get("/api/e2e/provider-requests");
  expect(await requests.text()).toContain("CC_UPDATED_INSTRUCTIONS_MARKER");
});

test("preserves a completed response after reloading the page", async ({ page }) => {
  await createSpecialist(page, "Browser Persistence");
  await send(page, "Persist this response.");
  await page.reload();
  await expect(page.getByText("Local v2 response.", { exact: true })).toBeVisible();
});

test("writes native v2 configuration for a newly created specialist", async ({ page }) => {
  await createSpecialist(page, "Browser Configuration");
  const response = await page.request.get("/api/file-manager/files/content", {
    params: { root: "workspace", path: "specialists/browser-configuration/opencode.jsonc" },
  });
  expect(response.ok()).toBe(true);
  const file = fileManagerFileContentResponseSchema.parse(await response.json());
  expect(JSON.parse(file.content)).toMatchObject({
    model: "local-e2e/test",
    permissions: expect.any(Array),
    mcp: { servers: expect.any(Object) },
  });
});

test("sends a text attachment through the real chat route", async ({ page }) => {
  await createSpecialist(page, "Browser Attachment");
  await page.getByTestId("chat-attachment-input").setInputFiles({
    name: "local-notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("CC_LOCAL_ATTACHMENT_MARKER"),
  });
  await send(page, "Read the attached notes.");
  const requests = await page.request.get("/api/e2e/provider-requests");
  expect(await requests.text()).toContain("CC_LOCAL_ATTACHMENT_MARKER");
});
