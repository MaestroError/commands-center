import { describe, expect, it } from "vitest";

import {
  chatEventSchema,
  conversationAttachmentSchema,
  conversationMessageSchema,
  replyPermissionInputSchema,
  replyQuestionInputSchema,
  sendConversationCommandInputSchema,
  sendConversationShellInputSchema,
  sessionMediaItemSchema,
} from "../../src/schemas/index.js";
import {
  liveRequestActionSchema,
  liveRequestFormFieldSchema,
  liveRequestResolveInputSchema,
  liveRequestSchema,
} from "../../src/schemas/live-requests.js";

describe("conversation and event schemas", () => {
  it("applies defaults for conversation attachments and command inputs", () => {
    expect(conversationAttachmentSchema.parse({ mimeType: "text/plain" })).toEqual({
      mimeType: "text/plain",
      type: "file",
    });

    expect(sendConversationCommandInputSchema.parse({ command: "  ls  " })).toEqual({
      command: "ls",
      arguments: "",
      attachments: [],
    });
  });

  it("parses conversation messages with flexible part payloads", () => {
    const result = conversationMessageSchema.parse({
      id: "msg_1",
      conversationId: "conv_1",
      role: "assistant",
      content: "Done",
      parts: [{ id: "part_1", type: "text", text: "Done" }],
      attachments: [],
      createdAt: "2026-05-03T12:00:00.000Z",
      updatedAt: "2026-05-03T12:00:01.000Z",
    });

    expect(result.parts[0]).toMatchObject({ type: "text", text: "Done" });
  });

  it("validates shell commands and session media URLs", () => {
    expect(sendConversationShellInputSchema.parse({ command: "  npm test  " })).toEqual({
      command: "npm test",
    });

    expect(
      sessionMediaItemSchema.parse({
        id: "prt_1",
        messageId: "msg_1",
        mime: "image/png",
        url: "data:image/png;base64,Zm9v",
        createdAt: "2026-05-03T12:00:00.000Z",
      }),
    ).toBeTruthy();

    expect(() =>
      sessionMediaItemSchema.parse({
        id: "prt_1",
        messageId: "msg_1",
        mime: "image/png",
        url: "https://example.com/file.png",
        createdAt: "2026-05-03T12:00:00.000Z",
      }),
    ).toThrow();
  });

  it("parses live request fields, actions, and resolve input defaults", () => {
    expect(
      liveRequestFormFieldSchema.parse({
        type: "text",
        name: "title",
        label: "Title",
        defaultValue: "Draft",
      }),
    ).toMatchObject({ type: "text", name: "title" });

    expect(
      liveRequestFormFieldSchema.parse({
        type: "password",
        name: "token",
        label: "Token",
      }),
    ).toMatchObject({ type: "password", name: "token" });

    expect(
      liveRequestActionSchema.parse({
        id: "save",
        label: "Save",
      }),
    ).toEqual({
      id: "save",
      label: "Save",
      variant: "secondary",
      kind: "submit",
      disabledWhen: [],
    });

    expect(liveRequestResolveInputSchema.parse({ values: { title: "Done" } })).toEqual({
      action: "submit",
      values: { title: "Done" },
    });
  });

  it("parses chat events for permission requests and live request openings", () => {
    const permissionAsked = chatEventSchema.parse({
      type: "permission.asked",
      properties: {
        id: "req_1",
        sessionID: "sess_1",
        permission: "github_issues_create",
      },
    });

    expect(permissionAsked).toMatchObject({
      type: "permission.asked",
      properties: { patterns: [], metadata: {}, always: [] },
    });

    const liveRequest = liveRequestSchema.parse({
      id: "live_1",
      conversationId: "conv_1",
      kind: "rename-agent",
      presentation: {
        title: "Rename agent",
      },
      fields: [
        {
          type: "textarea",
          name: "instructions",
          label: "Instructions",
        },
      ],
      createdAt: "2026-05-03T12:00:00.000Z",
    });

    expect(
      chatEventSchema.parse({
        type: "cc.live_request.opened",
        properties: { request: liveRequest },
      }),
    ).toMatchObject({
      type: "cc.live_request.opened",
      properties: { request: { id: "live_1" } },
    });
  });

  it("parses reply inputs and rejects invalid permission replies", () => {
    expect(replyQuestionInputSchema.parse({ answers: [["yes"], ["a", "b"]] })).toEqual({
      answers: [["yes"], ["a", "b"]],
    });

    expect(replyPermissionInputSchema.parse({ reply: "always" })).toEqual({
      reply: "always",
    });

    expect(() => replyPermissionInputSchema.parse({ reply: "later" })).toThrow();
  });
});
