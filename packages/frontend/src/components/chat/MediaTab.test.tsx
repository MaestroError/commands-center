import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MediaTab } from "./MediaTab";

import * as api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  fetchConversationMedia: vi.fn(),
}));

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(api.fetchConversationMedia).mockReset();
});

describe("MediaTab", () => {
  it("renders an empty state when the conversation has no media", async () => {
    vi.mocked(api.fetchConversationMedia).mockResolvedValue([]);

    render(<MediaTab conversationId="conv-1" onSearchQueryChange={vi.fn()} searchQuery="" />, {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText("No uploads shared in this conversation")).toBeInTheDocument();
    });
  });

  it("groups media and opens an image preview modal", async () => {
    vi.mocked(api.fetchConversationMedia).mockResolvedValue([
      {
        id: "img-1",
        messageId: "msg-1",
        filename: "diagram.png",
        mime: "image/png",
        url: "data:image/png;base64,AAAA",
        createdAt: "2026-04-22T10:00:00.000Z",
      },
      {
        id: "doc-1",
        messageId: "msg-2",
        filename: "notes.pdf",
        mime: "application/pdf",
        url: "data:application/pdf;base64,BBBB",
        createdAt: "2026-04-22T11:00:00.000Z",
      },
      {
        id: "bin-1",
        messageId: "msg-3",
        filename: "archive.zip",
        mime: "application/zip",
        url: "data:application/zip;base64,CCCC",
        createdAt: "2026-04-22T12:00:00.000Z",
      },
    ]);

    render(<MediaTab conversationId="conv-1" onSearchQueryChange={vi.fn()} searchQuery="" />, {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(screen.getByText("Images")).toBeInTheDocument());

    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(screen.getByText("Other files")).toBeInTheDocument();
    expect(screen.getByText("notes.pdf")).toBeInTheDocument();
    expect(screen.getByText("archive.zip")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Preview diagram.png" }));

    expect(screen.getByRole("dialog", { name: "Image preview" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Image preview" })).not.toBeInTheDocument();
    });
  });

  it("downloads document media with the original filename", async () => {
    vi.mocked(api.fetchConversationMedia).mockResolvedValue([
      {
        id: "doc-1",
        messageId: "msg-2",
        filename: "notes.pdf",
        mime: "application/pdf",
        url: "data:application/pdf;base64,BBBB",
        createdAt: "2026-04-22T11:00:00.000Z",
      },
    ]);

    const blob = new Blob(["pdf"]);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(blob));
    const originalCreateObjectURL = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
    const originalRevokeObjectURL = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
    const createObjectURLMock = vi.fn(() => "blob:download");
    const revokeObjectURLMock = vi.fn();

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURLMock,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURLMock,
    });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    render(<MediaTab conversationId="conv-1" onSearchQueryChange={vi.fn()} searchQuery="" />, {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(screen.getByText("notes.pdf")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Download notes.pdf" }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith("data:application/pdf;base64,BBBB");
    });

    expect(createObjectURLMock).toHaveBeenCalled();
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:download");
    expect(clickSpy).toHaveBeenCalled();

    if (originalCreateObjectURL) {
      Object.defineProperty(URL, "createObjectURL", originalCreateObjectURL);
    }
    if (originalRevokeObjectURL) {
      Object.defineProperty(URL, "revokeObjectURL", originalRevokeObjectURL);
    }
  });

  it("filters images and documents with the shared search field", async () => {
    const onSearchQueryChange = vi.fn();

    vi.mocked(api.fetchConversationMedia).mockResolvedValue([
      {
        id: "img-1",
        messageId: "msg-1",
        filename: "diagram.png",
        mime: "image/png",
        url: "data:image/png;base64,AAAA",
        createdAt: "2026-04-22T10:00:00.000Z",
      },
      {
        id: "doc-1",
        messageId: "msg-2",
        filename: "Carpenter Vacancy Redberry.pdf",
        mime: "application/pdf",
        url: "data:application/pdf;base64,BBBB",
        createdAt: "2026-04-22T11:00:00.000Z",
      },
    ]);

    const { rerender } = render(
      <MediaTab conversationId="conv-1" onSearchQueryChange={onSearchQueryChange} searchQuery="" />,
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(screen.getByText("diagram.png")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Search uploads"), {
      target: { value: "Carpenter Vacancy" },
    });

    expect(onSearchQueryChange).toHaveBeenCalledWith("Carpenter Vacancy");

    rerender(
      <MediaTab
        conversationId="conv-1"
        onSearchQueryChange={onSearchQueryChange}
        searchQuery="Carpenter Vacancy"
      />,
    );

    expect(screen.getByText("Carpenter Vacancy Redberry.pdf")).toBeInTheDocument();
    expect(screen.queryByText("diagram.png")).not.toBeInTheDocument();
  });
});
