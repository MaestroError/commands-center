import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ChatSidePaneHost } from "./ChatSidePaneHost";

describe("ChatSidePaneHost", () => {
  it("renders the title, children, and close button", () => {
    const onClose = vi.fn();

    render(
      <ChatSidePaneHost
        closeLabel="Dismiss panel"
        onClose={onClose}
        title="Inspector"
        titleClassName="font-semibold"
      >
        <div>Panel content</div>
      </ChatSidePaneHost>,
    );

    expect(screen.getByTestId("chat-side-pane-host")).toBeInTheDocument();
    expect(screen.getByText("Inspector")).toHaveClass("font-semibold");
    expect(screen.getByText("Panel content")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss panel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
