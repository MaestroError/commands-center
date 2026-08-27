import { describe, expect, it } from "vitest";

import {
  chatEventSchema,
  conversationAttachmentSchema,
  conversationMessageSchema,
  pendingInteractionsSchema,
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
  it("parses initial and upstream-reconnected stream readiness events", () => {
    expect(chatEventSchema.parse({ type: "connected", properties: {} })).toEqual({
      type: "connected",
      properties: {},
    });
    expect(chatEventSchema.parse({ type: "connected", properties: { reconnected: true } })).toEqual(
      {
        type: "connected",
        properties: { reconnected: true },
      },
    );
  });

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
    expect(
      chatEventSchema.parse({
        type: "session.error",
        properties: {
          sessionID: "sess_1",
          error: {
            name: "APIError",
            message: "Provider rejected the request.",
            data: { statusCode: 400 },
          },
        },
      }),
    ).toMatchObject({
      type: "session.error",
      properties: {
        sessionID: "sess_1",
        error: { name: "APIError", message: "Provider rejected the request." },
      },
    });

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

  it("carries the originating tool call on permission/question asked events", () => {
    const permissionAsked = chatEventSchema.parse({
      type: "permission.asked",
      properties: {
        id: "req_1",
        sessionID: "sess_1",
        permission: "bash",
        tool: { messageID: "msg_1", callID: "call_1" },
      },
    });

    expect(permissionAsked).toMatchObject({
      type: "permission.asked",
      properties: { tool: { messageID: "msg_1", callID: "call_1" } },
    });

    const questionAsked = chatEventSchema.parse({
      type: "question.asked",
      properties: {
        id: "req_2",
        sessionID: "sess_1",
        questions: [{ question: "Proceed?", options: [{ label: "Yes" }] }],
        tool: { messageID: "msg_2", callID: "call_2" },
      },
    });

    expect(questionAsked).toMatchObject({
      type: "question.asked",
      properties: { tool: { messageID: "msg_2", callID: "call_2" } },
    });

    // tool is optional — events without it (or from older clients) still parse.
    const withoutTool = chatEventSchema.parse({
      type: "permission.asked",
      properties: { id: "req_3", sessionID: "sess_1", permission: "bash" },
    });
    expect(withoutTool.properties).not.toHaveProperty("tool");
  });

  it("parses pending interactions snapshots used to rehydrate a reopened chat", () => {
    const parsed = pendingInteractionsSchema.parse({
      permissions: [
        {
          id: "req_1",
          sessionID: "sess_1",
          permission: "bash",
          patterns: ["rm *"],
          tool: { messageID: "msg_1", callID: "call_1" },
        },
      ],
      question: {
        id: "req_2",
        sessionID: "sess_1",
        questions: [{ question: "Proceed?", options: [{ label: "Yes" }, { label: "No" }] }],
      },
      questions: [
        {
          id: "req_2",
          sessionID: "sess_1",
          questions: [{ question: "Proceed?", options: [{ label: "Yes" }, { label: "No" }] }],
        },
      ],
      liveRequests: [
        {
          id: "live_1",
          conversationId: "conv_1",
          kind: "add_secret",
          presentation: { title: "Add secret" },
          fields: [],
          createdAt: "2026-05-03T12:00:00.000Z",
        },
      ],
    });

    expect(parsed.permissions[0]).toMatchObject({ id: "req_1", patterns: ["rm *"] });
    expect(parsed.question).toMatchObject({ id: "req_2" });
    expect(parsed.questions).toEqual([expect.objectContaining({ id: "req_2" })]);
    expect(parsed.liveRequests[0]).toMatchObject({ id: "live_1" });

    // No pending question is represented as null, not omitted.
    expect(
      pendingInteractionsSchema.parse({ permissions: [], question: null, liveRequests: [] }),
    ).toEqual({ permissions: [], question: null, liveRequests: [] });
  });
});
