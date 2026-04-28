import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { FileMentionPopover } from "./FileMentionPopover";
import * as api from "../../lib/api";

vi.mock("../../lib/api", () => ({
  searchAgentWorkspaceFiles: vi.fn(),
}));

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    value: vi.fn(),
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    value: originalScrollIntoView,
    configurable: true,
  });
});

describe("FileMentionPopover", () => {
  it("loads file-name search results from the agent workspace", async () => {
    vi.mocked(api.searchAgentWorkspaceFiles).mockResolvedValueOnce(["README.md", "src/index.ts"]);

    render(
      <FileMentionPopover
        agentId="agent-1"
        query="read"
        onSelect={vi.fn()}
        onClose={vi.fn()}
        onKeyDown={vi.fn()}
      />,
    );

    expect(await screen.findByRole("button", { name: /README\.md/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /src\/index\.ts/i })).toBeInTheDocument();
    expect(api.searchAgentWorkspaceFiles).toHaveBeenCalledWith("agent-1", "read");
  });

  it("selects the active result when Enter is pressed", async () => {
    vi.mocked(api.searchAgentWorkspaceFiles).mockResolvedValueOnce(["README.md", "src/index.ts"]);
    const onSelect = vi.fn();
    const onKeyDown = vi.fn();

    render(
      <FileMentionPopover
        agentId="agent-1"
        query="read"
        onSelect={onSelect}
        onClose={vi.fn()}
        onKeyDown={onKeyDown}
      />,
    );

    await screen.findByRole("button", { name: /README\.md/i });

    fireEvent.keyDown(screen.getByText("File mention").closest("div") as HTMLElement, {
      key: "Enter",
    });

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith("README.md");
    });
    expect(onKeyDown).not.toHaveBeenCalled();
  });
});
