import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TaskRunArtifact } from "@cc/shared/schemas";

import { ArtifactShareControls } from "./ArtifactShareControls";
import { useTaskMutations, useTaskRunArtifactsQuery } from "@/hooks/use-tasks-query";

vi.mock("@/hooks/use-tasks-query", () => ({
  useTaskRunArtifactsQuery: vi.fn(),
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

function setArtifacts(data: unknown, isLoading = false): void {
  vi.mocked(useTaskRunArtifactsQuery).mockReturnValue({
    data,
    isLoading,
  } as unknown as ReturnType<typeof useTaskRunArtifactsQuery>);
}

const artifact: TaskRunArtifact = { title: "Report", path: "/runs/run-1/report.pdf" };

function registered(overrides: Record<string, unknown> = {}) {
  return {
    id: "art-1",
    taskId: "task-1",
    runId: "run-1",
    title: "Report",
    originalFilename: "report.pdf",
    mimeType: "application/pdf",
    sizeBytes: 100,
    checksum: "abc",
    storageKey: "key",
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
  it("renders nothing for a URL-only artifact without a path", () => {
    setArtifacts({ artifacts: [] });
    const { container } = render(
      <ArtifactShareControls
        taskId="task-1"
        runId="run-1"
        artifact={{ title: "External", url: "https://example.com" }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a loading placeholder while artifacts load", () => {
    setArtifacts(undefined, true);
    render(<ArtifactShareControls taskId="task-1" runId="run-1" artifact={artifact} />);
    expect(screen.getByText("Loading share state...")).toBeInTheDocument();
  });

  it("explains when no matching source file is registered", () => {
    setArtifacts({ artifacts: [registered({ originalFilename: "other.pdf" })] });
    render(<ArtifactShareControls taskId="task-1" runId="run-1" artifact={artifact} />);
    expect(screen.getByText("Source file unavailable for sharing.")).toBeInTheDocument();
  });

  it("creates a signed link and copies it to the clipboard", async () => {
    setArtifacts({ artifacts: [registered()] });
    createMutateAsync.mockResolvedValue({
      shareId: "share-1",
      url: "https://share.example/abc",
      expiresAt: null,
    });
    render(<ArtifactShareControls taskId="task-1" runId="run-1" artifact={artifact} />);

    fireEvent.click(screen.getByRole("button", { name: "Create signed link" }));

    expect(await screen.findByText("https://share.example/abc")).toBeInTheDocument();
    expect(createMutateAsync).toHaveBeenCalledWith({
      taskId: "task-1",
      runId: "run-1",
      artifactId: "art-1",
    });
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://share.example/abc"),
    );
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();

    // Re-copy via the dedicated copy button.
    fireEvent.click(screen.getByRole("button", { name: "Copied" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(2);
  });

  it("still reveals the link when copying to the clipboard fails", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    setArtifacts({ artifacts: [registered()] });
    createMutateAsync.mockResolvedValue({
      shareId: "share-1",
      url: "https://share.example/abc",
      expiresAt: null,
    });
    render(<ArtifactShareControls taskId="task-1" runId="run-1" artifact={artifact} />);

    fireEvent.click(screen.getByRole("button", { name: "Create signed link" }));

    // The URL is shown even though the clipboard write rejected.
    expect(await screen.findByText("https://share.example/abc")).toBeInTheDocument();
    // The copy state never flips to "Copied" because the write failed.
    expect(await screen.findByRole("button", { name: "Copy link" })).toBeInTheDocument();

    // Clicking the explicit copy button also swallows the rejection.
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
  });

  it("lists existing share links and revokes one", async () => {
    setArtifacts({
      artifacts: [
        registered({
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
        }),
      ],
    });
    revokeMutateAsync.mockResolvedValue(undefined);
    render(<ArtifactShareControls taskId="task-1" runId="run-1" artifact={artifact} />);

    expect(screen.getByLabelText("Active artifact share links")).toBeInTheDocument();
    expect(screen.getByText(/1 download$/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    await waitFor(() =>
      expect(revokeMutateAsync).toHaveBeenCalledWith({
        taskId: "task-1",
        runId: "run-1",
        artifactId: "art-1",
        shareId: "share-9",
      }),
    );
  });
});
