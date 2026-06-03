import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CopyableCode, EndpointsTab } from "./EndpointsTab";

beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});

describe("EndpointsTab", () => {
  it("renders the static guidance when no token shortcut is provided", () => {
    render(<EndpointsTab />);
    expect(screen.getByText("Public API")).toBeInTheDocument();
    // The else-branch renders plain text instead of the "Create a token" button.
    expect(screen.queryByRole("button", { name: "Create a token" })).not.toBeInTheDocument();
  });

  it("invokes the token shortcut when provided", () => {
    const onGoToTokens = vi.fn();
    render(<EndpointsTab onGoToTokens={onGoToTokens} />);
    fireEvent.click(screen.getByRole("button", { name: "Create a token" }));
    expect(onGoToTokens).toHaveBeenCalledTimes(1);
  });
});

describe("CopyableCode", () => {
  it("copies its code and shows a transient confirmation", async () => {
    render(<CopyableCode label="cURL" code="curl https://example.com" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("curl https://example.com"),
    );
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });
});
