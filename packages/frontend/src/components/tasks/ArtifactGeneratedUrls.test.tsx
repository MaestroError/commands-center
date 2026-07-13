import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Artifact } from "@cc/shared/schemas";

import { ArtifactGeneratedUrls } from "./ArtifactGeneratedUrls";
import { useArtifactDeliveryUrlsQuery } from "@/hooks/use-tasks-query";

vi.mock("@/hooks/use-tasks-query", () => ({
  useArtifactDeliveryUrlsQuery: vi.fn(),
}));

type DeliveryUrls = {
  displayUrl: string | null;
  downloadUrl: string | null;
  expiresAt: string | null;
};

function setQuery(data: DeliveryUrls | undefined): void {
  vi.mocked(useArtifactDeliveryUrlsQuery).mockReturnValue({ data } as unknown as ReturnType<
    typeof useArtifactDeliveryUrlsQuery
  >);
}

function artifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: "art-1",
    conversationId: "conv-1",
    title: "Report",
    type: "document",
    link: "Reports/2026-07-13/report.md",
    createdAt: "2026-01-01T00:00:00.000Z",
    shareLinks: [],
    ...overrides,
  };
}

beforeEach(() => {
  setQuery(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});

describe("ArtifactGeneratedUrls", () => {
  it("renders nothing for a url artifact", () => {
    const { container } = render(
      <ArtifactGeneratedUrls artifact={artifact({ type: "url", link: "https://example.com" })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the template exposes no URLs", () => {
    setQuery({ displayUrl: null, downloadUrl: null, expiresAt: null });
    const { container } = render(<ArtifactGeneratedUrls artifact={artifact()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the display and download URLs with a copy action and expiry", async () => {
    setQuery({
      displayUrl: "https://cc.example/artifacts/art-1/display?exp=1&sig=a",
      downloadUrl: "https://cc.example/artifacts/art-1/download?exp=1&sig=b",
      expiresAt: "2026-07-14T00:00:00.000Z",
    });
    render(<ArtifactGeneratedUrls artifact={artifact()} />);

    expect(screen.getByText("Generated URLs")).toBeInTheDocument();
    expect(
      screen.getByText("https://cc.example/artifacts/art-1/display?exp=1&sig=a"),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Expires /)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy Download URL" }));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "https://cc.example/artifacts/art-1/download?exp=1&sig=b",
      ),
    );
  });

  it("shows a non-expiring label when expiresAt is null", () => {
    setQuery({
      displayUrl: "https://cc.example/artifacts/art-1/display?exp=0&sig=a",
      downloadUrl: null,
      expiresAt: null,
    });
    render(<ArtifactGeneratedUrls artifact={artifact()} />);
    expect(screen.getByText("Does not expire")).toBeInTheDocument();
  });
});
