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

  it("renders the URL-token MCP fallback with a placeholder token", () => {
    render(<EndpointsTab />);

    expect(
      screen.getByText(/Temporary fallback for clients that cannot set headers/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText((content) => content.endsWith("/api/public/mcp?key=<YOUR_API_TOKEN>")),
    ).toBeInTheDocument();
  });

  it("documents controlled REST and MCP document access", () => {
    render(<EndpointsTab />);

    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(screen.getByText(/MCP tool: list_documents/)).toBeInTheDocument();
    expect(screen.getByText(/MCP tool: search_documents/)).toBeInTheDocument();
    expect(screen.getByText(/MCP tool: read_document/)).toBeInTheDocument();
    const readResponse = screen.getByText(/"revision":/);
    expect(readResponse).toHaveTextContent('"createdAt":');
    expect(readResponse).toHaveTextContent('"updatedAt":');
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
