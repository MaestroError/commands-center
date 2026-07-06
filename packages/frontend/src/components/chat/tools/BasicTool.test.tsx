import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BasicTool } from "./BasicTool";
import { PendingInteractionProvider } from "./PendingInteractionProvider";
import type { PendingToolInteraction } from "./pending-interaction-context";

function renderWithPending(
  ui: ReactElement,
  byCallId: Map<string, PendingToolInteraction> = new Map(),
  cancel: (interaction: PendingToolInteraction) => void = vi.fn(),
) {
  return render(
    <PendingInteractionProvider byCallId={byCallId} cancel={cancel}>
      {ui}
    </PendingInteractionProvider>,
  );
}

describe("BasicTool", () => {
  it("renders a non-interactive status dot with no pending-interaction provider mounted", () => {
    render(
      <BasicTool title="bash" status="running" callId="call-1">
        <p>details</p>
      </BasicTool>,
    );

    expect(screen.queryByRole("button", { name: "Cancel tool call" })).not.toBeInTheDocument();
    expect(screen.getByTitle("Running")).toBeInTheDocument();
  });

  it("renders a non-interactive dot when the tool call has no pending interaction", () => {
    renderWithPending(
      <BasicTool title="bash" status="running" callId="call-1">
        <p>details</p>
      </BasicTool>,
    );

    expect(screen.queryByRole("button", { name: "Cancel tool call" })).not.toBeInTheDocument();
  });

  it("renders a non-interactive dot when the part has no callId", () => {
    const byCallId = new Map<string, PendingToolInteraction>([
      ["call-1", { kind: "permission", requestId: "perm-1" }],
    ]);
    renderWithPending(
      <BasicTool title="bash" status="pending">
        <p>details</p>
      </BasicTool>,
      byCallId,
    );

    expect(screen.queryByRole("button", { name: "Cancel tool call" })).not.toBeInTheDocument();
  });

  it("renders the status as a cancel button when the call is blocked on a pending permission", () => {
    const byCallId = new Map<string, PendingToolInteraction>([
      ["call-1", { kind: "permission", requestId: "perm-1" }],
    ]);
    renderWithPending(
      <BasicTool title="bash" status="pending" callId="call-1">
        <p>details</p>
      </BasicTool>,
      byCallId,
    );

    expect(screen.getByRole("button", { name: "Cancel tool call" })).toBeInTheDocument();
  });

  it("does not render a cancel button for a completed tool even if the call id matches", () => {
    const byCallId = new Map<string, PendingToolInteraction>([
      ["call-1", { kind: "permission", requestId: "perm-1" }],
    ]);
    renderWithPending(
      <BasicTool title="bash" status="completed" callId="call-1">
        <p>details</p>
      </BasicTool>,
      byCallId,
    );

    expect(screen.queryByRole("button", { name: "Cancel tool call" })).not.toBeInTheDocument();
  });

  it("calls cancel with the matching interaction and does not toggle expansion", async () => {
    const user = userEvent.setup();
    const cancel = vi.fn();
    const byCallId = new Map<string, PendingToolInteraction>([
      ["call-1", { kind: "question", requestId: "q-1" }],
    ]);
    renderWithPending(
      <BasicTool title="ask" status="pending" callId="call-1">
        <p>hidden details</p>
      </BasicTool>,
      byCallId,
      cancel,
    );

    expect(screen.queryByText("hidden details")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel tool call" }));

    expect(cancel).toHaveBeenCalledExactlyOnceWith({ kind: "question", requestId: "q-1" });
    expect(screen.queryByText("hidden details")).not.toBeInTheDocument();
  });

  it("still toggles expansion when clicking the main trigger", async () => {
    const user = userEvent.setup();
    const byCallId = new Map<string, PendingToolInteraction>([
      ["call-1", { kind: "permission", requestId: "perm-1" }],
    ]);
    renderWithPending(
      <BasicTool title="bash" status="pending" callId="call-1">
        <p>toggle me</p>
      </BasicTool>,
      byCallId,
    );

    expect(screen.queryByText("toggle me")).not.toBeInTheDocument();
    await user.click(screen.getByText("bash"));
    expect(screen.getByText("toggle me")).toBeInTheDocument();
  });
});
