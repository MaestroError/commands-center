import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IntegrationsPage } from "./IntegrationsPage";

import { useMcpServerMutations, useMcpServersQuery } from "@/hooks/use-mcp-servers-query";

vi.mock("@/hooks/use-mcp-servers-query", () => ({
  useMcpServersQuery: vi.fn(),
  useMcpServerMutations: vi.fn(),
}));

const createMutateAsync = vi.fn();
const updateMutateAsync = vi.fn();
const setEnabledMutateAsync = vi.fn();
const removeMutateAsync = vi.fn();
const confirmSpy = vi.spyOn(window, "confirm");

beforeEach(() => {
  createMutateAsync.mockReset();
  updateMutateAsync.mockReset();
  setEnabledMutateAsync.mockReset();
  removeMutateAsync.mockReset();
  confirmSpy.mockReset();
  confirmSpy.mockReturnValue(true);

  vi.mocked(useMcpServersQuery).mockReturnValue({
    data: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  } as never);

  vi.mocked(useMcpServerMutations).mockReturnValue({
    create: { mutateAsync: createMutateAsync, isPending: false },
    update: { mutateAsync: updateMutateAsync, isPending: false },
    setEnabled: { mutateAsync: setEnabledMutateAsync, isPending: false },
    remove: { mutateAsync: removeMutateAsync, isPending: false },
  } as never);
});

describe("IntegrationsPage", () => {
  it("renders loading state while MCP servers are loading", () => {
    vi.mocked(useMcpServersQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    } as never);

    const { container } = render(<IntegrationsPage />);

    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(6);
  });

  it("renders MCP server cards and toggles enabled state", async () => {
    setEnabledMutateAsync.mockResolvedValue(undefined);
    vi.mocked(useMcpServersQuery).mockReturnValue({
      data: [
        {
          id: "mcp-1",
          name: "github",
          enabled: true,
          config: {
            url: "https://example.com/mcp",
            transport: "streamable-http",
            authMethod: "none",
            headers: [],
          },
          createdAt: "2026-04-22T10:00:00.000Z",
          updatedAt: "2026-04-22T10:00:00.000Z",
        },
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    render(<IntegrationsPage />);

    expect(screen.getByText("github")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Disable" }));

    await waitFor(() => {
      expect(setEnabledMutateAsync).toHaveBeenCalledWith({ id: "mcp-1", enabled: false });
    });
  });

  it("submits the add MCP server dialog", async () => {
    createMutateAsync.mockResolvedValue({ name: "github" });

    render(<IntegrationsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add MCP server" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "github" } });
    fireEvent.change(screen.getByLabelText("URL"), {
      target: { value: "https://example.com/mcp" },
    });
    fireEvent.change(screen.getByLabelText("Headers"), {
      target: { value: "Authorization: Bearer secret" },
    });
    fireEvent.change(screen.getByLabelText("Auth method"), {
      target: { value: "headers" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Add server" }));

    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledWith({
        name: "github",
        enabled: true,
        config: {
          url: "https://example.com/mcp",
          transport: "streamable-http",
          authMethod: "headers",
          headers: [{ key: "Authorization", value: "Bearer secret" }],
        },
      });
    });
  });

  it("shows validation errors in the add MCP server dialog", () => {
    render(<IntegrationsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add MCP server" }));
    fireEvent.change(screen.getByLabelText("Headers"), {
      target: { value: "invalid-header" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add server" }));

    expect(screen.getByText("Name is required.")).toBeInTheDocument();
    expect(screen.getByText("A valid URL is required.")).toBeInTheDocument();
    expect(screen.getByText("Headers must use 'Key: Value' format.")).toBeInTheDocument();
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it("submits the edit MCP server dialog", async () => {
    updateMutateAsync.mockResolvedValue({ name: "github-updated" });
    vi.mocked(useMcpServersQuery).mockReturnValue({
      data: [
        {
          id: "mcp-1",
          name: "github",
          enabled: true,
          config: {
            url: "https://example.com/mcp",
            transport: "streamable-http",
            authMethod: "none",
            headers: [],
          },
          createdAt: "2026-04-22T10:00:00.000Z",
          updatedAt: "2026-04-22T10:00:00.000Z",
        },
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    render(<IntegrationsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "github-updated" } });
    fireEvent.change(screen.getByLabelText("Auth method"), {
      target: { value: "headers" },
    });
    fireEvent.change(screen.getByLabelText("Headers"), {
      target: { value: "X-API-Key: secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(updateMutateAsync).toHaveBeenCalledWith({
        id: "mcp-1",
        input: {
          name: "github-updated",
          config: {
            url: "https://example.com/mcp",
            transport: "streamable-http",
            authMethod: "headers",
            headers: [{ key: "X-API-Key", value: "secret" }],
          },
        },
      });
    });
  });

  it("removes an MCP server after confirmation", async () => {
    removeMutateAsync.mockResolvedValue(undefined);
    vi.mocked(useMcpServersQuery).mockReturnValue({
      data: [
        {
          id: "mcp-1",
          name: "github",
          enabled: true,
          config: {
            url: "https://example.com/mcp",
            transport: "streamable-http",
            authMethod: "none",
            headers: [],
          },
          createdAt: "2026-04-22T10:00:00.000Z",
          updatedAt: "2026-04-22T10:00:00.000Z",
        },
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    render(<IntegrationsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledWith("Remove MCP server 'github'?");
      expect(removeMutateAsync).toHaveBeenCalledWith({ id: "mcp-1" });
    });
  });

  it("renders query errors and mutation errors", async () => {
    createMutateAsync.mockRejectedValue(new Error("Create failed"));
    vi.mocked(useMcpServersQuery).mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      error: new Error("Query failed"),
      refetch: vi.fn(),
    } as never);

    const { rerender } = render(<IntegrationsPage />);

    expect(screen.getByText("MCP servers could not be loaded.")).toBeInTheDocument();
    expect(screen.getByText("Query failed")).toBeInTheDocument();

    vi.mocked(useMcpServersQuery).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    rerender(<IntegrationsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add MCP server" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "github" } });
    fireEvent.change(screen.getByLabelText("URL"), {
      target: { value: "https://example.com/mcp" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add server" }));

    await waitFor(() => {
      expect(screen.getByText("Create failed")).toBeInTheDocument();
    });
  });
});
