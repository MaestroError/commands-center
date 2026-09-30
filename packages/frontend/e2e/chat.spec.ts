import type { ChatEvent } from "@cc/shared/schemas";

import { createChatState, e2eSpecialist, mockChatApi } from "./app-fixtures";
import { expect, test } from "./fixtures";

test.describe("workspace chat", { tag: "@chat" }, () => {
  test("recovers a stale conversation URL across reloads", async ({ page }) => {
    await mockChatApi(page, createChatState());
    await page.route("**/api/specialists/agent-chat/conversations/deleted", (route) =>
      route.fulfill({
        status: 404,
        json: { error: { code: "not_found", message: "Conversation not found." } },
      }),
    );
    await page.goto("/chat/planner/deleted");
    await expect(page).toHaveURL(/\/chat\/planner\/conv-current$/);
    await expect(page.getByPlaceholder(/Type a message/)).toBeVisible();
    await page.reload();
    await expect(page.getByPlaceholder(/Type a message/)).toBeVisible();
    await expect(page).toHaveURL(/\/chat\/planner\/conv-current$/);
  });

  test("opens the selected specialist without reusing the previous conversation ID", async ({
    page,
    isMobile,
  }) => {
    const state = createChatState();
    await mockChatApi(page, state);
    const writer = { ...e2eSpecialist, id: "agent-writer", slug: "writer", name: "Writer" };
    await page.route("**/api/specialists", (route) =>
      route.fulfill({ json: [e2eSpecialist, writer] }),
    );
    await page.route("**/api/specialists/by-slug/writer", (route) =>
      route.fulfill({ json: writer }),
    );
    const writerConversation = { ...state.current, id: "writer-current", agentId: writer.id };
    const wrongRequests: string[] = [];
    await page.route("**/api/specialists/agent-writer/conversations**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/active")) {
        await route.fulfill({ json: { current: writerConversation, previous: [] } });
      } else if (path.endsWith("/writer-current")) {
        await route.fulfill({ json: writerConversation });
      } else {
        wrongRequests.push(path);
        await route.fulfill({
          status: 404,
          json: { error: { message: "Conversation not found." } },
        });
      }
    });
    await page.goto("/chat/writer/writer-current");
    await expect(page.getByPlaceholder(/Type a message/)).toBeVisible();
    await page.goto("/chat/planner/conv-current");
    await expect(page.getByPlaceholder(/Type a message/)).toBeVisible();
    if (isMobile) await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("link", { name: /Writer/ }).click();
    await expect(page).toHaveURL(/\/chat\/writer\/writer-current$/);
    await expect(page.getByRole("heading", { name: "Writer", exact: true })).toBeVisible();
    expect(wrongRequests).toEqual([]);
  });

  test("renders streamed text and tool-call parts from the event stream", async ({ page }) => {
    const state = createChatState({
      events: streamingEvents(),
    });
    await mockChatApi(page, state);

    await page.goto("/chat/planner");

    await expect(page.getByRole("heading", { name: "Planner" })).toBeVisible();
    await expect(page.getByText("Streaming draft complete.")).toBeVisible();
    await expect(page.getByRole("button", { name: /shell npm test/i })).toBeVisible();
  });

  test("sends a prompt with an uploaded attachment", async ({ page }) => {
    const state = createChatState();
    await mockChatApi(page, state);

    await page.goto("/chat/planner");

    await page.locator('input[type="file"]').setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("release notes"),
    });
    await expect(page.getByText("notes.txt")).toBeVisible();

    const promptRequest = page.waitForRequest(
      (request) =>
        request.url().includes("/api/conversations/conv-current/prompt?stream=true") &&
        request.method() === "POST",
    );
    await page.getByPlaceholder(/Type a message/).fill("Use the attached notes.");
    await page.getByRole("button", { name: "Send" }).click();

    const payload = JSON.parse((await promptRequest).postData() ?? "{}") as {
      text?: string;
      attachments?: Array<{ filename?: string; mimeType?: string }>;
    };
    expect(payload.text).toBe("Use the attached notes.");
    expect(payload.attachments).toEqual([
      expect.objectContaining({ filename: "notes.txt", mimeType: "text/plain" }),
    ]);
  });

  test("switches conversations from history", async ({ page }) => {
    const state = createChatState();
    await mockChatApi(page, state);

    await page.goto("/chat/planner");
    await page.getByTitle("Conversation history").click();
    await page.getByRole("button", { name: /Previous chat/ }).click();

    await expect(page).toHaveURL(/\/chat\/planner\/conv-previous$/);
    await expect(page.getByText("Previous chat summary is ready.")).toBeVisible();
  });

  test("shows a degraded send banner when prompting fails", async ({ page }) => {
    const state = createChatState({
      promptStatus: 503,
      promptError: "Engine is starting.",
    });
    await mockChatApi(page, state);

    await page.goto("/chat/planner");
    await page.getByPlaceholder(/Type a message/).fill("Can you respond?");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Message failed to send")).toBeVisible();
    await expect(page.getByText("Engine is starting.")).toBeVisible();
  });
});

function streamingEvents(): ChatEvent[] {
  return [
    {
      type: "message.updated",
      properties: {
        sessionID: "session-conv-current",
        message: {
          id: "msg-assistant-stream",
          conversationId: "conv-current",
          role: "assistant",
          content: "",
          parts: [],
          attachments: [],
          createdAt: "2026-01-01T00:00:01.000Z",
          updatedAt: "2026-01-01T00:00:01.000Z",
        },
      },
    },
    {
      type: "message.part.updated",
      properties: {
        sessionID: "session-conv-current",
        messageID: "msg-assistant-stream",
        part: { id: "part-stream-text", type: "text", text: "" },
      },
    },
    {
      type: "message.part.delta",
      properties: {
        sessionID: "session-conv-current",
        messageID: "msg-assistant-stream",
        partID: "part-stream-text",
        field: "text",
        delta: "Streaming draft ",
      },
    },
    {
      type: "message.part.delta",
      properties: {
        sessionID: "session-conv-current",
        messageID: "msg-assistant-stream",
        partID: "part-stream-text",
        field: "text",
        delta: "complete.",
      },
    },
    {
      type: "message.part.updated",
      properties: {
        sessionID: "session-conv-current",
        messageID: "msg-assistant-stream",
        part: {
          id: "part-tool-bash",
          type: "tool",
          tool: "bash",
          state: {
            status: "completed",
            input: { command: "npm test" },
            output: "All tests passed.",
          },
        },
      },
    },
  ];
}
