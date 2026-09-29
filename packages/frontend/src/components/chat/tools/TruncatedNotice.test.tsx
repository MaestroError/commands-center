import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ConversationPart } from "@cc/shared/schemas";

import { FullPartsProvider } from "./FullPartsProvider";
import { TruncatedNotice } from "./TruncatedNotice";

function part(state: Record<string, unknown>): ConversationPart {
  return { id: "p1", type: "tool", tool: "read", messageID: "m1", state } as ConversationPart;
}

function renderWithProvider(node: React.ReactNode, loadFullParts = vi.fn(() => Promise.resolve())) {
  render(<FullPartsProvider loadFullParts={loadFullParts}>{node}</FullPartsProvider>);
  return loadFullParts;
}

describe("TruncatedNotice", () => {
  it("stays out of the way when the value arrived whole", () => {
    const { container } = render(
      <FullPartsProvider loadFullParts={vi.fn()}>
        <TruncatedNotice field="output" part={part({ output: "short" })} />
      </FullPartsProvider>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("reports how much was withheld and fetches the rest on request", async () => {
    const user = userEvent.setup();
    const loadFullParts = renderWithProvider(
      <TruncatedNotice
        field="output"
        part={part({ output: "abc", outputTruncated: true, outputLength: 12_345 })}
      />,
    );

    expect(screen.getByText(/12,345 characters/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show full output" }));

    expect(loadFullParts).toHaveBeenCalledWith("m1");
  });

  it("surfaces a failed fetch instead of leaving the card silent", async () => {
    const user = userEvent.setup();
    renderWithProvider(
      <TruncatedNotice
        field="output"
        part={part({ output: "abc", outputTruncated: true, outputLength: 99 })}
      />,
      vi.fn(() => Promise.reject(new Error("Network down."))),
    );

    await user.click(screen.getByRole("button", { name: "Show full output" }));

    await waitFor(() => {
      expect(screen.getByText("Network down.")).toBeInTheDocument();
    });
  });

  it("renders nothing without a provider, so it cannot offer a dead action", () => {
    const { container } = render(
      <TruncatedNotice
        field="output"
        part={part({ output: "abc", outputTruncated: true, outputLength: 99 })}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("handles a truncated error the same way", async () => {
    const user = userEvent.setup();
    const loadFullParts = renderWithProvider(
      <TruncatedNotice
        field="error"
        part={part({ error: "boom", errorTruncated: true, errorLength: 500 })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Show full error" }));

    expect(loadFullParts).toHaveBeenCalledWith("m1");
  });
});
