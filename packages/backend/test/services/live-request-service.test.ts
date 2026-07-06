import { describe, expect, it } from "vitest";

import { createLiveRequestService } from "../../src/services/live-request-service";

import type { ChatEvent } from "@cc/shared/schemas";

describe("live request service", () => {
  it("publishes opened and resolved events for a conversation request", async () => {
    const service = createLiveRequestService();
    const controller = new AbortController();
    const events: ChatEvent[] = [];

    service.subscribe({
      conversationId: "conv-1",
      signal: controller.signal,
      onEvent: (event) => events.push(event),
    });

    const pending = service.create({
      conversationId: "conv-1",
      kind: "add_secret",
      closable: false,
      presentation: {
        title: "Add secret",
        submitLabel: "Add secret",
        cancelLabel: "Cancel",
      },
      fields: [
        { type: "text", name: "key", label: "Secret key", required: true },
        { type: "password", name: "value", label: "Secret value", required: true },
      ],
    });

    const openedEvent = events[0];
    expect(openedEvent?.type).toBe("cc.live_request.opened");
    if (openedEvent?.type !== "cc.live_request.opened") {
      throw new Error("Expected live request opened event.");
    }

    service.resolve("conv-1", openedEvent.properties.request.id, {
      action: "submit",
      values: { key: "API_TOKEN", value: "secret" },
    });

    await expect(pending).resolves.toEqual({
      action: "submit",
      values: { key: "API_TOKEN", value: "secret" },
    });
    expect(events.map((event) => event.type)).toEqual([
      "cc.live_request.opened",
      "cc.live_request.resolved",
    ]);

    controller.abort();
    service.dispose();
  });

  it("lists open requests scoped to a conversation and drops resolved/cancelled ones", async () => {
    const service = createLiveRequestService();

    const pendingA = service.create({
      conversationId: "conv-1",
      kind: "add_secret",
      closable: false,
      presentation: { title: "A", cancelLabel: "Cancel" },
      fields: [],
    });
    const pendingB = service.create({
      conversationId: "conv-1",
      kind: "add_secret",
      closable: false,
      presentation: { title: "B", cancelLabel: "Cancel" },
      fields: [],
    });
    const pendingOther = service.create({
      conversationId: "conv-2",
      kind: "add_secret",
      closable: false,
      presentation: { title: "Other conversation", cancelLabel: "Cancel" },
      fields: [],
    });
    void pendingOther.catch(() => {});

    const listed = service.listByConversation("conv-1");
    expect(listed.map((request) => request.presentation.title).sort()).toEqual(["A", "B"]);
    expect(service.listByConversation("conv-2")).toHaveLength(1);
    expect(service.listByConversation("conv-3")).toEqual([]);

    const requestA = listed.find((request) => request.presentation.title === "A")!;
    const requestB = listed.find((request) => request.presentation.title === "B")!;

    service.resolve("conv-1", requestA.id, { action: "submit", values: {} });
    await pendingA;

    const afterResolve = service.listByConversation("conv-1");
    expect(afterResolve).toHaveLength(1);
    expect(afterResolve[0]?.id).toBe(requestB.id);

    service.cancel("conv-1", requestB.id, "no longer needed");
    await expect(pendingB).rejects.toThrow("no longer needed");
    expect(service.listByConversation("conv-1")).toEqual([]);

    service.dispose();
  });
});
