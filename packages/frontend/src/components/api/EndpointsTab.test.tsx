import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetOAuthRuntime } from "@/lib/api/oauth";

import { CopyableCode, EndpointsTab } from "./EndpointsTab";

vi.mock("@/lib/api/oauth", () => ({
  resetOAuthRuntime: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
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

  it("documents automatic OAuth and static bearer authentication", () => {
    render(<EndpointsTab />);

    expect(screen.getByText("Automatic OAuth")).toBeInTheDocument();
    expect(screen.getByText("Bearer header")).toBeInTheDocument();
    expect(screen.getByText("Authorization: Bearer <YOUR_API_TOKEN>")).toBeInTheDocument();
    expect(
      screen.getByText(/Credentials in URL query parameters are rejected/i),
    ).toBeInTheDocument();
  });

  it("explains the impact before resetting OAuth connections", () => {
    render(<EndpointsTab />);

    fireEvent.click(screen.getByRole("button", { name: "Reset OAuth connections" }));

    expect(
      screen.getByRole("heading", { name: "Reset all OAuth connections?" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/All OAuth MCP clients will lose access/i)).toBeInTheDocument();
    expect(
      screen.getByText(/API tokens and their permissions will not be deleted/i),
    ).toBeInTheDocument();
  });

  it("resets OAuth connections after confirmation", async () => {
    vi.mocked(resetOAuthRuntime).mockResolvedValue({ status: "reset" });
    render(<EndpointsTab />);

    fireEvent.click(screen.getByRole("button", { name: "Reset OAuth connections" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset connections" }));

    await waitFor(() => expect(resetOAuthRuntime).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Existing OAuth clients must connect again",
    );
  });

  it("shows an error when OAuth connections cannot be reset", async () => {
    vi.mocked(resetOAuthRuntime).mockRejectedValue(new Error("Reset request failed."));
    render(<EndpointsTab />);

    fireEvent.click(screen.getByRole("button", { name: "Reset OAuth connections" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset connections" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Reset request failed.");
  });

  it("documents controlled REST and MCP document access", () => {
    render(<EndpointsTab />);

    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(screen.getByText(/MCP tool: list_documents/)).toBeInTheDocument();
    expect(screen.getByText(/MCP tool: search_documents/)).toBeInTheDocument();
    expect(screen.getByText(/MCP tool: read_document/)).toBeInTheDocument();
    expect(screen.getByText(/MCP tool: create_document/)).toBeInTheDocument();
    expect(
      screen.getByText(/global-folder grant includes that folder and every descendant/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Hidden documents are excluded from totals and pagination/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/returns the same not-found response as a missing document/),
    ).toBeInTheDocument();
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
