import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IntegrationsPage } from "./IntegrationsPage";

import { useAgentMutations, useAgentsQuery } from "@/hooks/use-agents-query";
import { useMcpServerMutations, useMcpServersQuery } from "@/hooks/use-mcp-servers-query";
import { useSecretsQuery } from "@/hooks/use-secrets-query";

vi.mock("@/hooks/use-agents-query", () => ({
  useAgentsQuery: vi.fn(),
  useAgentMutations: vi.fn(),
}));

vi.mock("@/hooks/use-mcp-servers-query", () => ({
  useMcpServersQuery: vi.fn(),
  useMcpServerMutations: vi.fn(),
}));

vi.mock("@/hooks/use-secrets-query", () => ({
  useSecretsQuery: vi.fn(),
}));

const createMutateAsync = vi.fn();
const updateMutateAsync = vi.fn();
const setEnabledMutateAsync = vi.fn();
const removeMutateAsync = vi.fn();
const startAuthMutateAsync = vi.fn();
const completeAuthMutateAsync = vi.fn();
const authenticateMutateAsync = vi.fn();
const removeAuthMutateAsync = vi.fn();
const updateAgentMutateAsync = vi.fn();
const confirmSpy = vi.spyOn(window, "confirm");
const writeClipboardSpy = vi.fn(() => Promise.resolve());

function setViewport(size: "mobile" | "medium" | "large") {
  vi.mocked(window.matchMedia).mockImplementation((query: string) => {
    const matches =
      size === "large"
        ? query === "(min-width: 1280px)" || query === "(min-width: 768px)"
        : size === "medium"
          ? query === "(min-width: 768px)"
          : false;

    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    };
  });
}

beforeEach(() => {
  window.localStorage.clear();
  setViewport("large");
  createMutateAsync.mockReset();
  updateMutateAsync.mockReset();
  setEnabledMutateAsync.mockReset();
  removeMutateAsync.mockReset();
  startAuthMutateAsync.mockReset();
  completeAuthMutateAsync.mockReset();
  authenticateMutateAsync.mockReset();
  removeAuthMutateAsync.mockReset();
  updateAgentMutateAsync.mockReset();
  confirmSpy.mockReset();
  confirmSpy.mockReturnValue(true);
  Object.defineProperty(window.navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: writeClipboardSpy,
    },
  });
  writeClipboardSpy.mockReset();

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
    refresh: { mutate: vi.fn(), isPending: false },
  } as never);

  vi.mocked(useSecretsQuery).mockReturnValue({
    data: [],
    isLoading: false,
    error: null,
  } as never);

  vi.mocked(useAgentsQuery).mockReturnValue({
    data: [
      {
        id: "agent-1",
        slug: "writer",
        name: "Writer",
        role: "write",
        instructions: "Write things",
        defaultModel: "openai/gpt-4.1",
        workspacePath: "/tmp/writer",
        status: "active",
        capabilities: { builtInSkills: [], customTools: [], mcpServers: [], toolPermissions: [] },
        createdAt: "2026-04-22T10:00:00.000Z",
        updatedAt: "2026-04-22T10:00:00.000Z",
      },
      {
        id: "agent-2",
        slug: "reviewer",
        name: "Reviewer",
        role: "review",
        instructions: "Review things",
        defaultModel: "openai/gpt-4.1",
        workspacePath: "/tmp/reviewer",
        status: "active",
        capabilities: { builtInSkills: [], customTools: [], mcpServers: [], toolPermissions: [] },
        createdAt: "2026-04-22T10:00:00.000Z",
        updatedAt: "2026-04-22T10:00:00.000Z",
      },
    ],
    isLoading: false,
    error: null,
  } as never);

  vi.mocked(useAgentMutations).mockReturnValue({
    create: { mutateAsync: vi.fn(), isPending: false },
    update: { mutateAsync: updateAgentMutateAsync, isPending: false },
    archive: { mutateAsync: vi.fn(), isPending: false },
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

  it("renders the dedicated Composio section before suggested MCPs", () => {
    render(<IntegrationsPage />);

    expect(screen.getByRole("heading", { name: "Composio" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect Composio" })).toBeInTheDocument();
    expect(screen.queryByText("Built-in MCP")).not.toBeInTheDocument();
  });

  it("activates Composio with OAuth using the predefined MCP config", async () => {
    createMutateAsync.mockResolvedValue({
      id: "mcp-composio",
      name: "composio",
      enabled: true,
      config: {
        url: "https://connect.composio.dev/mcp",
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

    fireEvent.click(screen.getByRole("button", { name: "Connect Composio" }));
    fireEvent.click(screen.getByRole("button", { name: "Activate Composio" }));

    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledWith({
        enabled: true,
        name: "composio",
        config: {
          url: "https://connect.composio.dev/mcp",
          transport: "streamable-http",
          authMethod: "oauth",
          headers: [],
        },
      });
    });

    expect(screen.getByRole("button", { name: "Authenticate in browser" })).toBeInTheDocument();
  });

  it("activates Composio with API key using the predefined header", async () => {
    createMutateAsync.mockResolvedValue({
      id: "mcp-composio",
      name: "my-composio",
      enabled: true,
      config: {
        url: "https://connect.composio.dev/mcp",
        transport: "streamable-http",
        authMethod: "headers",
        headers: [{ key: "x-consumer-api-key", value: "secret-key" }],
      },
      runtimeStatus: { status: "connected" },
      tools: [],
      createdAt: "2026-04-22T10:00:00.000Z",
      updatedAt: "2026-04-22T10:00:00.000Z",
    });

    render(<IntegrationsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Connect Composio" }));
    fireEvent.click(screen.getByLabelText("API key"));
    fireEvent.change(screen.getByLabelText("Composio name"), {
      target: { value: "my-composio" },
    });
    fireEvent.change(screen.getByLabelText("Consumer API key"), {
      target: { value: "secret-key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Activate Composio" }));

    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledWith({
        enabled: true,
        name: "my-composio",
        config: {
          url: "https://connect.composio.dev/mcp",
          transport: "streamable-http",
          authMethod: "headers",
          headers: [{ key: "x-consumer-api-key", value: "secret-key" }],
        },
      });
    });
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
    fireEvent.click(screen.getByRole("button", { name: "Disable" }));

    await waitFor(() => {
      expect(setEnabledMutateAsync).toHaveBeenCalledWith({ id: "mcp-1", enabled: false });
    });
  });

  it("renders copyable missing secrets with a settings shortcut", async () => {
    vi.mocked(useMcpServersQuery).mockReturnValue({
      data: [
        {
          id: "mcp-1",
          name: "context7",
          enabled: true,
          config: {
            url: "https://mcp.context7.com/mcp",
            transport: "streamable-http",
            authMethod: "headers",
            headers: [{ key: "Authorization", value: "Bearer {env:CONTEXT_SECRET_KEY}" }],
          },
          missingSecrets: ["CONTEXT_SECRET_KEY"],
          runtimeStatus: { status: "disconnected" },
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

    fireEvent.click(screen.getByRole("button", { name: /Copy CONTEXT_SECRET_KEY/i }));

    await waitFor(() => {
      expect(writeClipboardSpy).toHaveBeenCalledWith("CONTEXT_SECRET_KEY");
    });

    expect(
      screen.getByRole("button", { name: /Copy CONTEXT_SECRET_KEY/i }).querySelector("svg"),
    ).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Open secrets in new tab" })).toHaveAttribute(
      "href",
      "/settings",
    );
    expect(screen.getByText("CONTEXT_SECRET_KEY")).toBeInTheDocument();
  });

  it("submits the add MCP server dialog", async () => {
    createMutateAsync.mockResolvedValue({ name: "github" });

    render(<IntegrationsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add custom MCP server" }));
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

  it("assigns a newly created MCP server to selected agents", async () => {
    createMutateAsync.mockResolvedValue({
      id: "mcp-new",
      name: "github",
      enabled: true,
      config: {
        url: "https://example.com/mcp",
        transport: "streamable-http",
        authMethod: "headers",
        headers: [{ key: "Authorization", value: "Bearer token" }],
      },
      runtimeStatus: { status: "disconnected" },
      tools: [],
      missingSecrets: [],
      createdAt: "2026-04-22T10:00:00.000Z",
      updatedAt: "2026-04-22T10:00:00.000Z",
    });
    updateAgentMutateAsync.mockResolvedValue(undefined);

    render(<IntegrationsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add custom MCP server" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "github" } });
    fireEvent.change(screen.getByLabelText("URL"), {
      target: { value: "https://example.com/mcp" },
    });
    fireEvent.change(screen.getByLabelText("Headers"), {
      target: { value: "Authorization: Bearer token" },
    });
    fireEvent.change(screen.getByLabelText("Auth method"), {
      target: { value: "headers" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Enable for agents/i }));
    fireEvent.click(screen.getByLabelText("Writer"));
    fireEvent.click(screen.getByRole("button", { name: "Add server" }));

    await waitFor(() => {
      expect(updateAgentMutateAsync).toHaveBeenCalledWith({
        id: "agent-1",
        input: {
          capabilities: {
            builtInSkills: [],
            customTools: [],
            mcpServers: [{ name: "github", enabled: true, action: "allow" }],
            toolPermissions: [],
          },
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

    fireEvent.click(screen.getByRole("button", { name: "Add custom MCP server" }));
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

    fireEvent.click(screen.getByRole("button", { name: "Add custom MCP server" }));
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

    fireEvent.click(screen.getByRole("button", { name: "Add custom MCP server" }));
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

    fireEvent.click(screen.getByRole("button", { name: "Add custom MCP server" }));
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

    fireEvent.click(screen.getByRole("button", { name: "Add custom MCP server" }));
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

    fireEvent.click(screen.getByRole("button", { name: "Add custom MCP server" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "github" } });
    fireEvent.change(screen.getByLabelText("URL"), {
      target: { value: "https://example.com/mcp" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add server" }));

    await waitFor(() => {
      expect(screen.getByText("Create failed")).toBeInTheDocument();
    });
  });

  it("shows only the first suggested MCP row until expanded", () => {
    render(<IntegrationsPage />);

    expect(screen.getByText("Suggested MCPs")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Notion" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Context7" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add GitHub" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Brave Search" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show all suggested MCPs" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show all suggested MCPs" }));

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
    expect(screen.getByRole("button", { name: "Show less suggested MCPs" })).toBeInTheDocument();
  });

  it("expands suggested MCPs automatically while searching", () => {
    render(<IntegrationsPage />);

    fireEvent.change(screen.getByLabelText("Search suggested MCPs"), {
      target: { value: "brave" },
    });

    expect(screen.getByRole("button", { name: "Add Brave Search" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Show all suggested MCPs" }),
    ).not.toBeInTheDocument();
  });

  it("persists the suggested MCP section collapsed state", () => {
    const view = render(<IntegrationsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Collapse Suggested MCPs" }));

    expect(screen.queryByLabelText("Search suggested MCPs")).not.toBeInTheDocument();

    view.unmount();
    render(<IntegrationsPage />);

    expect(screen.getByRole("button", { name: "Expand Suggested MCPs" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Search suggested MCPs")).not.toBeInTheDocument();
  });

  it("shows active Composio state separately from configured MCP servers", () => {
    vi.mocked(useMcpServersQuery).mockReturnValue({
      data: [
        {
          id: "mcp-composio",
          name: "composio",
          enabled: true,
          config: {
            url: "https://connect.composio.dev/mcp",
            transport: "streamable-http",
            authMethod: "oauth",
            headers: [],
          },
          runtimeStatus: { status: "connected" },
          tools: [{ id: "composio_SLACK_SEND_MESSAGE", name: "SLACK_SEND_MESSAGE" }],
          createdAt: "2026-04-22T10:00:00.000Z",
          updatedAt: "2026-04-22T10:00:00.000Z",
        },
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    render(<IntegrationsPage />);

    expect(screen.getByRole("heading", { name: "Composio" })).toBeInTheDocument();
    expect(
      screen.getByText("Connect your workspace to external apps through Composio", {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("No MCP servers configured yet")).toBeInTheDocument();
  });

  it("deactivates Composio from the dedicated section", async () => {
    removeMutateAsync.mockResolvedValue(undefined);
    vi.mocked(useMcpServersQuery).mockReturnValue({
      data: [
        {
          id: "mcp-composio",
          name: "composio",
          enabled: true,
          config: {
            url: "https://connect.composio.dev/mcp",
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

    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledWith("Deactivate Composio MCP server 'composio'?");
      expect(removeMutateAsync).toHaveBeenCalledWith({ id: "mcp-composio" });
    });
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
