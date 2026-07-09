import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Artifact } from "@cc/shared/schemas";

import { ChatResultsPanel } from "./ChatResultsPanel";
import { useConversationArtifactsQuery } from "@/hooks/use-tasks-query";

vi.mock("@/hooks/use-tasks-query", () => ({
  useConversationArtifactsQuery: vi.fn(),
  useTaskMutations: vi.fn(() => ({
    createArtifactShareLink: { mutateAsync: vi.fn(), isPending: false },
    revokeArtifactShareLink: { mutateAsync: vi.fn(), isPending: false },
  })),
}));

function setArtifacts(artifacts: Artifact[], isLoading = false): void {
  vi.mocked(useConversationArtifactsQuery).mockReturnValue({
    data: { artifacts },
    isLoading,
  } as unknown as ReturnType<typeof useConversationArtifactsQuery>);
}

function artifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: "art-1",
    conversationId: "conv-1",
    title: "Report",
    type: "document",
    link: "reports/summary.md",
    createdAt: "2026-01-01T00:00:00.000Z",
    shareLinks: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(useConversationArtifactsQuery).mockReset();
});

describe("ChatResultsPanel", () => {
  it("shows an empty hint when there are no artifacts", () => {
    setArtifacts([]);
    render(<ChatResultsPanel conversationId="conv-1" />);
    expect(screen.getByText(/No results yet/)).toBeInTheDocument();
  });

  it("renders registered artifacts as links", () => {
    setArtifacts([
      artifact({ id: "a1", title: "Summary", type: "document", link: "reports/summary.md" }),
      artifact({ id: "a2", title: "Repo", type: "url", link: "https://example.com" }),
      artifact({
        id: "a3",
        title: "Complete Tool List",
        type: "file",
        link: "references/tool-list.md",
        fileManagerPath: "specialists/writer/Documents/references/tool-list.md",
      }),
    ]);
    render(<ChatResultsPanel conversationId="conv-1" />);

    expect(screen.getByRole("link", { name: "Summary" })).toBeInTheDocument();
    const external = screen.getByRole("link", { name: "Repo" });
    expect(external).toHaveAttribute("href", "https://example.com");
    expect(external).toHaveAttribute("target", "_blank");
    const fileLink = screen.getByRole("link", { name: "Complete Tool List" });
    const params = new URLSearchParams(fileLink.getAttribute("href")?.replace("/files?", ""));
    expect(params.get("path")).toBe("specialists/writer/Documents/references");
    expect(params.get("select")).toBe("specialists/writer/Documents/references/tool-list.md");
  });

  it("queries artifacts for the given conversation", () => {
    setArtifacts([]);
    render(<ChatResultsPanel conversationId="conv-xyz" />);
    expect(useConversationArtifactsQuery).toHaveBeenCalledWith("conv-xyz", {
      refetchInterval: 3_000,
    });
  });
});
