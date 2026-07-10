import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Artifact } from "@cc/shared/schemas";

import { ArtifactShareControls } from "./ArtifactShareControls";
import { useTaskMutations } from "@/hooks/use-tasks-query";

vi.mock("@/hooks/use-tasks-query", () => ({
  useTaskMutations: vi.fn(),
}));

const createMutateAsync = vi.fn();
const revokeMutateAsync = vi.fn();

function setMutations(overrides: { createPending?: boolean; revokePending?: boolean } = {}): void {
  vi.mocked(useTaskMutations).mockReturnValue({
    createArtifactShareLink: {
      mutateAsync: createMutateAsync,
      isPending: overrides.createPending ?? false,
    },
    revokeArtifactShareLink: {
      mutateAsync: revokeMutateAsync,
      isPending: overrides.revokePending ?? false,
    },
  } as unknown as ReturnType<typeof useTaskMutations>);
}

function artifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: "art-1",
    conversationId: "conv-1",
    title: "Report",
    type: "file",
    link: "runs/run-1/report.pdf",
    createdAt: "2026-01-01T00:00:00.000Z",
    shareLinks: [],
    ...overrides,
  };
}

beforeEach(() => {
  createMutateAsync.mockReset();
  revokeMutateAsync.mockReset();
  setMutations();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});

describe("ArtifactShareControls", () => {
  it("renders nothing for a non-file artifact", () => {
    const { container } = render(
      <ArtifactShareControls artifact={artifact({ type: "url", link: "https://example.com" })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("creates a signed link and copies it to the clipboard", async () => {
    createMutateAsync.mockResolvedValue({
      shareId: "share-1",
      url: "https://share.example/abc",
      displayUrl: "https://share.example/render/abc",
      downloadUrl: "https://share.example/download/abc",
      expiresAt: null,
    });
    render(<ArtifactShareControls artifact={artifact()} taskId="task-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Create signed link" }));

    expect(await screen.findByText("https://share.example/render/abc")).toBeInTheDocument();
    expect(screen.getByText("https://share.example/download/abc")).toBeInTheDocument();
    expect(createMutateAsync).toHaveBeenCalledWith({
      artifactId: "art-1",
      conversationId: "conv-1",
      taskId: "task-1",
    });
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "https://share.example/render/abc",
      ),
    );
    expect(await screen.findByRole("button", { name: "Render URL copied" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Render URL copied" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Copy Download URL" }));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "https://share.example/download/abc",
      ),
    );
  });

  it("still reveals the link when copying to the clipboard fails", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    createMutateAsync.mockResolvedValue({
      shareId: "share-1",
      url: "https://share.example/abc",
      displayUrl: "https://share.example/render/abc",
      downloadUrl: "https://share.example/download/abc",
      expiresAt: null,
    });
    render(<ArtifactShareControls artifact={artifact()} />);

    fireEvent.click(screen.getByRole("button", { name: "Create signed link" }));

    expect(await screen.findByText("https://share.example/render/abc")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Copy Render URL" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy Download URL" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy Render URL" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "Copy Render URL" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy Download URL" })).toBeInTheDocument();
  });

  it("shows an error when signed link creation fails", async () => {
    createMutateAsync.mockRejectedValue(new Error("Artifact source file not found."));
    render(<ArtifactShareControls artifact={artifact()} />);

    fireEvent.click(screen.getByRole("button", { name: "Create signed link" }));

    expect(await screen.findByText("Artifact source file not found.")).toBeInTheDocument();
  });

  it("lists existing share links and revokes one", async () => {
    revokeMutateAsync.mockResolvedValue(undefined);
    render(
      <ArtifactShareControls
        taskId="task-1"
        artifact={artifact({
          shareLinks: [
            {
              id: "share-9",
              artifactId: "art-1",
              expiresAt: "2026-02-01T00:00:00.000Z",
              revokedAt: null,
              lastUsedAt: null,
              downloadCount: 1,
              createdAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        })}
      />,
    );

    expect(screen.getByLabelText("Active artifact share links")).toBeInTheDocument();
    expect(screen.getByText(/1 download$/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    await waitFor(() =>
      expect(revokeMutateAsync).toHaveBeenCalledWith({
        artifactId: "art-1",
        conversationId: "conv-1",
        taskId: "task-1",
        shareId: "share-9",
      }),
    );
  });
});
