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
const authenticateMutateAsync = vi.fn();
const removeAuthMutateAsync = vi.fn();
const confirmSpy = vi.spyOn(window, "confirm");

beforeEach(() => {
  createMutateAsync.mockReset();
  updateMutateAsync.mockReset();
  setEnabledMutateAsync.mockReset();
  removeMutateAsync.mockReset();
  startAuthMutateAsync.mockReset();
  completeAuthMutateAsync.mockReset();
  authenticateMutateAsync.mockReset();
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
    authenticate: { mutateAsync: authenticateMutateAsync, isPending: false },
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

  it("auto-opens the auth dialog after adding an OAuth MCP server", async () => {
    createMutateAsync.mockResolvedValue({
      id: "mcp-new",
      name: "notion",
      enabled: true,
      config: {
        url: "https://mcp.notion.com/mcp",
        transport: "streamable-http",
        authMethod: "oauth",
        headers: [],
      },
      runtimeStatus: { status: "needs_auth" },
      tools: [],
      createdAt: "2026-04-22T10:00:00.000Z",
      updatedAt: "2026-04-22T10:00:00.000Z",
    });

    render(<IntegrationsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add MCP server" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "notion" } });
    fireEvent.change(screen.getByLabelText("URL"), {
      target: { value: "https://mcp.notion.com/mcp" },
    });
    fireEvent.change(screen.getByLabelText("Auth method"), { target: { value: "oauth" } });
    fireEvent.click(screen.getByRole("button", { name: "Add server" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Authenticate in browser" })).toBeInTheDocument();
    });
  });

  it("does not auto-open the auth dialog after adding a non-OAuth server", async () => {
    createMutateAsync.mockResolvedValue({
      id: "mcp-new",
      name: "github",
      enabled: true,
      config: {
        url: "https://example.com/mcp",
        transport: "streamable-http",
        authMethod: "headers",
        headers: [{ key: "Authorization", value: "Bearer secret" }],
      },
      runtimeStatus: { status: "connected" },
      tools: [],
      createdAt: "2026-04-22T10:00:00.000Z",
      updatedAt: "2026-04-22T10:00:00.000Z",
    });

    render(<IntegrationsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add MCP server" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "github" } });
    fireEvent.change(screen.getByLabelText("URL"), {
      target: { value: "https://example.com/mcp" },
    });
    fireEvent.change(screen.getByLabelText("Headers"), {
      target: { value: "Authorization: Bearer secret" },
    });
    fireEvent.change(screen.getByLabelText("Auth method"), { target: { value: "headers" } });
    fireEvent.click(screen.getByRole("button", { name: "Add server" }));

    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalled();
    });
    expect(
      screen.queryByRole("button", { name: "Authenticate in browser" }),
    ).not.toBeInTheDocument();
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

  it("supports MCP authenticate-in-browser flow and credential removal", async () => {
    authenticateMutateAsync.mockResolvedValue({ name: "github" });
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
    fireEvent.click(screen.getByRole("button", { name: "Authenticate in browser" }));

    await waitFor(() => {
      expect(authenticateMutateAsync).toHaveBeenCalledWith({ id: "mcp-1" });
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

  it("renders suggested MCP server cards", () => {
    render(<IntegrationsPage />);

    expect(screen.getByText("Suggested MCPs")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Notion" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Context7" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add GitHub" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Brave Search" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Linear" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Sentry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Vercel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Supabase" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Playwright" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add AntV Charts" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Mermaid" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Fetcher" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add MarkItDown" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add DuckDuckGo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Memory" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Sequential Thinking" })).toBeInTheDocument();
  });

  it("does not render the Composio panel", () => {
    render(<IntegrationsPage />);

    expect(screen.queryByText("Composio")).not.toBeInTheDocument();
  });

  it("prefills the add MCP server dialog from a suggestion", () => {
    render(<IntegrationsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add Notion" }));

    expect(screen.getByLabelText("Name")).toHaveValue("notion");
    expect(screen.getByLabelText("URL")).toHaveValue("https://mcp.notion.com/mcp");
    expect(screen.getByLabelText("Auth method")).toHaveValue("oauth");
  });

  it("hides a suggestion when a server with the same name is already configured", () => {
    vi.mocked(useMcpServersQuery).mockReturnValue({
      data: [
        {
          id: "mcp-1",
          name: "notion",
          enabled: true,
          config: {
            url: "https://mcp.notion.com/mcp",
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

    expect(screen.queryByRole("button", { name: "Add Notion" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add GitHub" })).toBeInTheDocument();
  });
});
