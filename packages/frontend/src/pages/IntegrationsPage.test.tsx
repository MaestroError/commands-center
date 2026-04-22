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
const startAuthMutateAsync = vi.fn();
const completeAuthMutateAsync = vi.fn();
const removeAuthMutateAsync = vi.fn();
const confirmSpy = vi.spyOn(window, "confirm");
const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

beforeEach(() => {
  createMutateAsync.mockReset();
  updateMutateAsync.mockReset();
  setEnabledMutateAsync.mockReset();
  removeMutateAsync.mockReset();
  startAuthMutateAsync.mockReset();
  completeAuthMutateAsync.mockReset();
  removeAuthMutateAsync.mockReset();
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
    startAuth: { mutateAsync: startAuthMutateAsync, isPending: false },
    completeAuth: { mutateAsync: completeAuthMutateAsync, isPending: false },
    removeAuth: { mutateAsync: removeAuthMutateAsync, isPending: false },
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
            authMethod: "oauth",
            headers: [],
          },
          runtimeStatus: { status: "needs_auth" },
          tools: [{ id: "github_create_issue", name: "create_issue" }],
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
    expect(screen.getByText("Needs auth")).toBeInTheDocument();
    expect(screen.getByText("create_issue")).toBeInTheDocument();
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

  it("submits a stdio MCP server from the dialog", async () => {
    createMutateAsync.mockResolvedValue({ name: "filesystem" });

    render(<IntegrationsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add MCP server" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "filesystem" } });
    fireEvent.change(screen.getByLabelText("Transport"), { target: { value: "stdio" } });
    fireEvent.change(screen.getByLabelText("Command"), {
      target: { value: "npx\n-y\n@modelcontextprotocol/server-filesystem\n/tmp/workspace" },
    });
    fireEvent.change(screen.getByLabelText("Environment"), {
      target: { value: "NODE_ENV=test" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Add server" }));

    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledWith({
        name: "filesystem",
        enabled: true,
        config: {
          transport: "stdio",
          command: ["npx", "-y", "@modelcontextprotocol/server-filesystem", "/tmp/workspace"],
          environment: {
            NODE_ENV: "test",
          },
        },
      });
    });
  });

  it("validates stdio command and environment input", () => {
    render(<IntegrationsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add MCP server" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "filesystem" } });
    fireEvent.change(screen.getByLabelText("Transport"), { target: { value: "stdio" } });
    fireEvent.change(screen.getByLabelText("Environment"), { target: { value: "INVALID" } });
    fireEvent.click(screen.getByRole("button", { name: "Add server" }));

    expect(screen.getByText("At least one command segment is required.")).toBeInTheDocument();
    expect(
      screen.getByText("Environment entries must use 'KEY=value' format."),
    ).toBeInTheDocument();
    expect(createMutateAsync).not.toHaveBeenCalled();
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
            authMethod: "oauth",
            headers: [],
          },
          runtimeStatus: { status: "connected" },
          tools: [],
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
            authMethod: "oauth",
            headers: [],
          },
          runtimeStatus: { status: "connected" },
          tools: [],
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

  it("supports MCP OAuth start, callback completion, and auth removal", async () => {
    startAuthMutateAsync.mockResolvedValue({ authorizationUrl: "https://example.com/oauth" });
    completeAuthMutateAsync.mockResolvedValue({ name: "github" });
    removeAuthMutateAsync.mockResolvedValue({ success: true });
    vi.mocked(useMcpServersQuery).mockReturnValue({
      data: [
        {
          id: "mcp-1",
          name: "github",
          enabled: true,
          config: {
            url: "https://example.com/mcp",
            transport: "streamable-http",
            authMethod: "oauth",
            headers: [],
          },
          runtimeStatus: { status: "connected" },
          tools: [{ id: "github_create_issue", name: "create_issue" }],
          createdAt: "2026-04-22T10:00:00.000Z",
          updatedAt: "2026-04-22T10:00:00.000Z",
        },
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    render(<IntegrationsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Re-authenticate" }));
    fireEvent.click(screen.getByRole("button", { name: "Start OAuth" }));

    await waitFor(() => {
      expect(startAuthMutateAsync).toHaveBeenCalledWith({ id: "mcp-1" });
      expect(openSpy).toHaveBeenCalledWith(
        "https://example.com/oauth",
        "_blank",
        "noopener,noreferrer",
      );
    });

    fireEvent.change(screen.getByLabelText("Callback code"), { target: { value: "done" } });
    fireEvent.click(screen.getByRole("button", { name: "Complete auth" }));

    await waitFor(() => {
      expect(completeAuthMutateAsync).toHaveBeenCalledWith({ id: "mcp-1", code: "done" });
    });

    fireEvent.click(screen.getByRole("button", { name: "Remove auth" }));

    await waitFor(() => {
      expect(removeAuthMutateAsync).toHaveBeenCalledWith({ id: "mcp-1" });
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
