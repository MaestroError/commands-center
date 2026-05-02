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
      values: { key: "API_TOKEN", value: "secret" },
    });

    await expect(pending).resolves.toEqual({
      values: { key: "API_TOKEN", value: "secret" },
    });
    expect(events.map((event) => event.type)).toEqual([
      "cc.live_request.opened",
      "cc.live_request.resolved",
    ]);

    controller.abort();
    service.dispose();
  });
});
