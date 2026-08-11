import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IntegrationsPage } from "./IntegrationsPage";

import { useSpecialistMutations, useSpecialistsQuery } from "@/hooks/use-specialists-query";
import { useMcpServerMutations, useMcpServersQuery } from "@/hooks/use-mcp-servers-query";
import { useSecretMutations, useSecretsQuery } from "@/hooks/use-secrets-query";
import { useActiveTaskRunsQuery } from "@/hooks/use-tasks-query";
import { useSystemVersionQuery } from "@/hooks/use-system-version-query";
import { McpEngineRestartRequiredError } from "@/lib/api";

vi.mock("@/hooks/use-specialists-query", () => ({
  useSpecialistsQuery: vi.fn(),
  useSpecialistMutations: vi.fn(),
}));

vi.mock("@/hooks/use-mcp-servers-query", () => ({
  useMcpServersQuery: vi.fn(),
  useMcpServerMutations: vi.fn(),
}));

vi.mock("@/hooks/use-secrets-query", () => ({
  useSecretsQuery: vi.fn(),
  useSecretMutations: vi.fn(),
}));

vi.mock("@/hooks/use-tasks-query", () => ({
  useActiveTaskRunsQuery: vi.fn(),
}));

vi.mock("@/hooks/use-system-version-query", () => ({
  useSystemVersionQuery: vi.fn(),
}));

const createMutateAsync = vi.fn();
const updateMutateAsync = vi.fn();
const setEnabledMutateAsync = vi.fn();
const activateMutateAsync = vi.fn();
const removeMutateAsync = vi.fn();
const startAuthMutateAsync = vi.fn();
const completeAuthMutateAsync = vi.fn();
const authenticateMutateAsync = vi.fn();
const removeAuthMutateAsync = vi.fn();
const setSecretMutateAsync = vi.fn();
const updateSpecialistMutateAsync = vi.fn();
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

async function selectOption(label: string, option: string): Promise<void> {
  const user = userEvent.setup();
  await user.click(screen.getByRole("combobox", { name: label }));
  await user.click(await screen.findByRole("option", { name: option }));
}

beforeEach(() => {
  window.localStorage.clear();
  setViewport("large");
  createMutateAsync.mockReset();
  updateMutateAsync.mockReset();
  setEnabledMutateAsync.mockReset();
  activateMutateAsync.mockReset();
  removeMutateAsync.mockReset();
  startAuthMutateAsync.mockReset();
  completeAuthMutateAsync.mockReset();
  authenticateMutateAsync.mockReset();
  removeAuthMutateAsync.mockReset();
  setSecretMutateAsync.mockReset();
  updateSpecialistMutateAsync.mockReset();
  confirmSpy.mockReset();
  confirmSpy.mockReturnValue(true);
  vi.mocked(window.open).mockClear();
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
    activate: { mutateAsync: activateMutateAsync, isPending: false, error: null },
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

  vi.mocked(useSecretMutations).mockReturnValue({
    set: { mutateAsync: setSecretMutateAsync, isPending: false },
    remove: { mutateAsync: vi.fn(), isPending: false },
  } as never);

  vi.mocked(useActiveTaskRunsQuery).mockReturnValue({ data: [] } as never);

  vi.mocked(useSystemVersionQuery).mockReturnValue({
    data: {
      current: "1.0.0",
      updateAvailable: false,
      installMode: "docker",
      autoUpdateEnabled: false,
      autoUpdateSource: "environment",
    },
    isLoading: false,
    error: null,
  } as never);

  vi.mocked(useSpecialistsQuery).mockReturnValue({
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

  vi.mocked(useSpecialistMutations).mockReturnValue({
    create: { mutateAsync: vi.fn(), isPending: false },
    update: { mutateAsync: updateSpecialistMutateAsync, isPending: false },
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
    expect(screen.getByRole("button", { name: "Add Composio connection" })).toBeInTheDocument();
    expect(screen.queryByText("Built-in MCP")).not.toBeInTheDocument();
  });

  it("saves Composio disabled with the predefined API key header", async () => {
    createMutateAsync.mockResolvedValue({
      id: "mcp-composio",
      name: "my-composio",
      enabled: false,
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

    fireEvent.click(screen.getByRole("button", { name: "Add Composio connection" }));
    // No auth-method choice anymore — Composio is API-key only.
    expect(screen.queryByLabelText("OAuth")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Composio name"), {
      target: { value: "my-composio" },
    });
    fireEvent.change(screen.getByLabelText("Composio API key"), {
      target: { value: "secret-key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Composio" }));

    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledWith({
        enabled: false,
        name: "my-composio",
        config: {
          url: "https://connect.composio.dev/mcp",
          transport: "streamable-http",
          authMethod: "headers",
          headers: [{ key: "x-consumer-api-key", value: "secret-key" }],
        },
      });
    });
    expect(
      screen.getByText(
        "Composio API key saved. Activate Composio when you are ready to restart the AI engine.",
      ),
    ).toBeInTheDocument();
  });

  it("lets the user cancel a Composio restart and activate later", async () => {
    mockConfiguredComposio({ enabled: false, requiresEngineRestart: true });
    vi.mocked(useActiveTaskRunsQuery).mockReturnValue({
      data: [{ status: "running" }, { status: "running" }],
    } as never);
    activateMutateAsync.mockResolvedValue({ name: "composio" });

    const user = userEvent.setup();
    render(<IntegrationsPage />);

    await user.click(screen.getByRole("button", { name: "Activate" }));
    expect(
      screen.getByRole("heading", { name: "Restart the AI engine to activate composio?" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/2 task runs are currently active/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(activateMutateAsync).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Activate" }));
    await user.click(screen.getByRole("button", { name: "Restart and activate" }));

    await waitFor(() => {
      expect(activateMutateAsync).toHaveBeenCalledWith({
        id: "mcp-composio",
        restartEngine: true,
      });
    });
  });

  it("activates Composio without prompting when the saved key is already loaded", async () => {
    mockConfiguredComposio({ enabled: false, requiresEngineRestart: false });
    activateMutateAsync.mockResolvedValue({ name: "composio" });

    const user = userEvent.setup();
    render(<IntegrationsPage />);

    await user.click(screen.getByRole("button", { name: "Activate" }));

    await waitFor(() => {
      expect(activateMutateAsync).toHaveBeenCalledWith({
        id: "mcp-composio",
        restartEngine: false,
      });
    });
    expect(
      screen.queryByRole("heading", { name: "Restart the AI engine to activate composio?" }),
    ).not.toBeInTheDocument();
  });

  it("renders one card per Composio connection", () => {
    mockComposioConnections(["composio", "composio-work"]);

    render(<IntegrationsPage />);

    const section = composioSection();
    expect(within(section).getByText("composio")).toBeInTheDocument();
    expect(within(section).getByText("composio-work")).toBeInTheDocument();
  });

  it("suggests a free name when a Composio connection already exists", () => {
    mockComposioConnections(["composio"]);

    render(<IntegrationsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add Composio connection" }));

    expect(screen.getByLabelText("Composio name")).toHaveValue("composio-2");
  });

  it("blocks a second Composio connection reusing an existing name", () => {
    mockComposioConnections(["composio"]);

    render(<IntegrationsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add Composio connection" }));
    fireEvent.change(screen.getByLabelText("Composio name"), { target: { value: "composio" } });
    fireEvent.change(screen.getByLabelText("Composio API key"), { target: { value: "key" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Composio" }));

    expect(screen.getByText("An MCP server named 'composio' already exists.")).toBeInTheDocument();
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it("activates only the Composio connection whose card was used", async () => {
    mockComposioConnections(["composio", "composio-work"], { enabled: false });
    activateMutateAsync.mockResolvedValue({ name: "composio-work" });

    const user = userEvent.setup();
    render(<IntegrationsPage />);

    const cards = within(composioSection()).getAllByRole("button", { name: "Activate" });
    await user.click(cards[1]!);

    await waitFor(() => {
      expect(activateMutateAsync).toHaveBeenCalledWith({
        id: "mcp-composio-work",
        restartEngine: false,
      });
    });
  });

  it("names the Composio connection in its restart-consent dialog", async () => {
    mockComposioConnections(["composio-work"], { enabled: false, requiresEngineRestart: true });

    const user = userEvent.setup();
    render(<IntegrationsPage />);

    await user.click(within(composioSection()).getByRole("button", { name: "Activate" }));

    expect(
      screen.getByRole("heading", { name: "Restart the AI engine to activate composio-work?" }),
    ).toBeInTheDocument();
  });

  it("previews the technical name derived from a CC instance label", () => {
    render(<IntegrationsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add CC instance" }));
    fireEvent.change(screen.getByLabelText("CC instance name"), {
      target: { value: "Knowledge base" },
    });

    expect(screen.getByText("knowledge_base")).toBeInTheDocument();
  });

  it("hides the derived-name note when the label is already a technical name", () => {
    render(<IntegrationsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add CC instance" }));
    fireEvent.change(screen.getByLabelText("CC instance name"), {
      target: { value: "knowledge_base" },
    });

    expect(screen.queryByText(/^Saved as/)).not.toBeInTheDocument();
  });

  it("saves a CC instance under the derived technical name", async () => {
    createMutateAsync.mockResolvedValue({ name: "knowledge_base" });

    render(<IntegrationsPage />);
    openCcInstanceDialog({ name: "Knowledge base", url: "cc.example.com", token: "cc-token" });

    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ name: "knowledge_base" }),
      );
    });
  });

  it("saves a custom MCP server under the derived technical name", async () => {
    createMutateAsync.mockResolvedValue({ name: "my_server", config: { transport: "stdio" } });

    render(<IntegrationsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add custom MCP server" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "My Server" } });
    fireEvent.change(screen.getByLabelText("URL"), {
      target: { value: "https://example.com/mcp" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add server" }));

    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ name: "my_server" }),
      );
    });
  });

  it("saves Composio under the derived technical name", async () => {
    createMutateAsync.mockResolvedValue({ name: "my_composio", config: { transport: "stdio" } });

    render(<IntegrationsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add Composio connection" }));
    fireEvent.change(screen.getByLabelText("Composio name"), { target: { value: "My Composio" } });
    fireEvent.change(screen.getByLabelText("Composio API key"), { target: { value: "key" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Composio" }));

    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ name: "my_composio" }),
      );
    });
  });

  it("blocks a CC instance label that derives to an empty name", () => {
    render(<IntegrationsPage />);
    openCcInstanceDialog({ name: "!!!", url: "cc.example.com", token: "cc-token" });

    expect(screen.getByText("Name must contain at least one letter or digit.")).toBeInTheDocument();
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it("renders the connected CC instances section before suggested MCPs", () => {
    render(<IntegrationsPage />);

    const instances = screen.getByRole("heading", { name: "Connected CC instances" });
    const suggested = screen.getByRole("heading", { name: "Suggested MCPs" });

    expect(instances.compareDocumentPosition(suggested) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("saves a CC instance disabled with a bearer secret reference", async () => {
    createMutateAsync.mockResolvedValue({ name: "staging-cc" });

    render(<IntegrationsPage />);
    openCcInstanceDialog({ name: "staging-cc", url: "cc.example.com", token: "cc-token" });

    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledWith({
        enabled: false,
        name: "staging-cc",
        config: {
          url: "https://cc.example.com/api/public/mcp",
          transport: "streamable-http",
          authMethod: "headers",
          headers: [{ key: "Authorization", value: "Bearer {env:CC_INSTANCE_STAGING_CC_TOKEN}" }],
        },
      });
    });
  });

  it("stores the CC instance token without restarting the engine", async () => {
    createMutateAsync.mockResolvedValue({ name: "staging-cc" });

    render(<IntegrationsPage />);
    openCcInstanceDialog({ name: "staging-cc", url: "cc.example.com", token: "cc-token" });

    await waitFor(() => {
      expect(setSecretMutateAsync).toHaveBeenCalledWith({
        key: "CC_INSTANCE_STAGING_CC_TOKEN",
        value: "cc-token",
        restart: false,
      });
    });
  });

  it("keeps a reverse-proxy sub-path when appending the public MCP path", async () => {
    createMutateAsync.mockResolvedValue({ name: "staging-cc" });

    render(<IntegrationsPage />);
    openCcInstanceDialog({ name: "staging-cc", url: "https://host.example.com/cc/", token: "t" });

    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            url: "https://host.example.com/cc/api/public/mcp",
          }),
        }),
      );
    });
  });

  it("does not append the public MCP path twice", async () => {
    createMutateAsync.mockResolvedValue({ name: "staging-cc" });

    render(<IntegrationsPage />);
    openCcInstanceDialog({
      name: "staging-cc",
      url: "https://cc.example.com/api/public/mcp",
      token: "t",
    });

    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({ url: "https://cc.example.com/api/public/mcp" }),
        }),
      );
    });
  });

  it("blocks saving a CC instance with an unusable URL", () => {
    render(<IntegrationsPage />);
    openCcInstanceDialog({ name: "staging-cc", url: "http://", token: "t" });

    expect(screen.getByText("A valid instance URL is required.")).toBeInTheDocument();
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it("blocks saving a CC instance with a secret name that cannot be referenced", () => {
    render(<IntegrationsPage />);
    openCcInstanceDialog({
      name: "staging-cc",
      url: "cc.example.com",
      secretKey: "staging-token",
      token: "t",
    });

    expect(
      screen.getByText(
        "Secret name must start with a letter or underscore and use only letters, digits, and underscores.",
      ),
    ).toBeInTheDocument();
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it("prefills the CC instance secret name from the instance name", () => {
    render(<IntegrationsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add CC instance" }));
    fireEvent.change(screen.getByLabelText("CC instance name"), {
      target: { value: "staging cc" },
    });

    expect(screen.getByLabelText("CC instance secret name")).toHaveValue(
      "CC_INSTANCE_STAGING_CC_TOKEN",
    );
  });

  it("stops deriving the secret name once it is edited by hand", () => {
    render(<IntegrationsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add CC instance" }));
    fireEvent.change(screen.getByLabelText("CC instance secret name"), {
      target: { value: "MY_TOKEN" },
    });
    fireEvent.change(screen.getByLabelText("CC instance name"), {
      target: { value: "staging-cc" },
    });

    expect(screen.getByLabelText("CC instance secret name")).toHaveValue("MY_TOKEN");
  });

  it("keeps a connected CC instance out of the configured MCP servers list", () => {
    mockCcInstance({ enabled: true });

    render(<IntegrationsPage />);

    const section = screen
      .getByRole("heading", { name: "Connected CC instances" })
      .closest("section");
    expect(within(section as HTMLElement).getByText("staging-cc")).toBeInTheDocument();
    expect(screen.getByText("No MCP servers configured yet")).toBeInTheDocument();
  });

  it("asks for restart consent before activating a CC instance", async () => {
    mockCcInstance({ requiresEngineRestart: true });

    const user = userEvent.setup();
    render(<IntegrationsPage />);

    await user.click(screen.getByRole("button", { name: "Activate" }));

    expect(
      screen.getByRole("heading", { name: "Restart the AI engine to activate staging-cc?" }),
    ).toBeInTheDocument();
  });

  it("makes no activation request when the CC instance restart is cancelled", async () => {
    mockCcInstance({ requiresEngineRestart: true });

    const user = userEvent.setup();
    render(<IntegrationsPage />);

    await user.click(screen.getByRole("button", { name: "Activate" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(activateMutateAsync).not.toHaveBeenCalled();
  });

  it("activates a CC instance with restart consent", async () => {
    mockCcInstance({ requiresEngineRestart: true });
    activateMutateAsync.mockResolvedValue({ name: "staging-cc" });

    const user = userEvent.setup();
    render(<IntegrationsPage />);

    await user.click(screen.getByRole("button", { name: "Activate" }));
    await user.click(screen.getByRole("button", { name: "Restart and activate" }));

    await waitFor(() => {
      expect(activateMutateAsync).toHaveBeenCalledWith({
        id: "mcp-instance",
        restartEngine: true,
      });
    });
  });

  it("activates a CC instance without prompting when its token is already loaded", async () => {
    mockCcInstance({ requiresEngineRestart: false });
    activateMutateAsync.mockResolvedValue({ name: "staging-cc" });

    const user = userEvent.setup();
    render(<IntegrationsPage />);

    await user.click(screen.getByRole("button", { name: "Activate" }));

    await waitFor(() => {
      expect(activateMutateAsync).toHaveBeenCalledWith({
        id: "mcp-instance",
        restartEngine: false,
      });
    });
    expect(
      screen.queryByRole("heading", { name: "Restart the AI engine to activate staging-cc?" }),
    ).not.toBeInTheDocument();
  });

  it("asks for restart consent when the backend reports stale CC instance state", async () => {
    mockCcInstance({ requiresEngineRestart: false });
    activateMutateAsync.mockRejectedValue(new McpEngineRestartRequiredError("Restart required."));

    const user = userEvent.setup();
    render(<IntegrationsPage />);

    await user.click(screen.getByRole("button", { name: "Activate" }));

    expect(
      await screen.findByRole("heading", { name: "Restart the AI engine to activate staging-cc?" }),
    ).toBeInTheDocument();
  });

  it("reports a failed CC instance activation on its card", async () => {
    mockCcInstance({ requiresEngineRestart: false });
    activateMutateAsync.mockRejectedValue(new Error("Engine restart failed."));

    const user = userEvent.setup();
    render(<IntegrationsPage />);

    await user.click(screen.getByRole("button", { name: "Activate" }));

    expect(await screen.findByText("Engine restart failed.")).toBeInTheDocument();
  });

  it("renders missing secret values for a CC instance", () => {
    mockCcInstance({ missingSecrets: ["CC_INSTANCE_STAGING_CC_TOKEN"] });

    render(<IntegrationsPage />);

    expect(screen.getByText("Missing secret values")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Copy CC_INSTANCE_STAGING_CC_TOKEN" }),
    ).toBeInTheDocument();
  });

  it("disables an enabled CC instance", async () => {
    mockCcInstance({ enabled: true });
    setEnabledMutateAsync.mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<IntegrationsPage />);

    await user.click(screen.getByRole("button", { name: "Disable" }));

    await waitFor(() => {
      expect(setEnabledMutateAsync).toHaveBeenCalledWith({ id: "mcp-instance", enabled: false });
    });
  });

  it("removes a CC instance after confirmation", async () => {
    mockCcInstance({ enabled: true });
    removeMutateAsync.mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<IntegrationsPage />);

    await user.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(removeMutateAsync).toHaveBeenCalledWith({ id: "mcp-instance" });
    });
  });

  it("keeps a CC instance when its removal is not confirmed", async () => {
    mockCcInstance({ enabled: true });
    confirmSpy.mockReturnValue(false);

    const user = userEvent.setup();
    render(<IntegrationsPage />);

    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(removeMutateAsync).not.toHaveBeenCalled();
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
    await selectOption("Auth method", "headers");

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

  it("assigns a newly created MCP server to selected specialists", async () => {
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
    updateSpecialistMutateAsync.mockResolvedValue(undefined);

    render(<IntegrationsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add custom MCP server" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "github" } });
    fireEvent.change(screen.getByLabelText("URL"), {
      target: { value: "https://example.com/mcp" },
    });
    fireEvent.change(screen.getByLabelText("Headers"), {
      target: { value: "Authorization: Bearer token" },
    });
    await selectOption("Auth method", "headers");
    fireEvent.click(screen.getByRole("button", { name: /Enable for specialists/i }));
    fireEvent.click(screen.getByLabelText("Writer"));
    fireEvent.click(screen.getByRole("button", { name: "Add server" }));

    await waitFor(() => {
      expect(updateSpecialistMutateAsync).toHaveBeenCalledWith({
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
    await selectOption("Auth method", "oauth");
    fireEvent.click(screen.getByRole("button", { name: "Add server" }));

    // Non-Composio OAuth servers use the CC-hosted redirect flow ("Authenticate"),
    // not OpenCode's loopback browser flow ("Authenticate in browser").
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Authenticate" })).toBeInTheDocument();
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
    await selectOption("Auth method", "headers");
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
    await selectOption("Transport", "stdio");
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

  it("validates stdio command and environment input", async () => {
    render(<IntegrationsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add custom MCP server" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "filesystem" } });
    await selectOption("Transport", "stdio");
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
    await selectOption("Auth method", "headers");
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

  it("supports the CC-hosted MCP OAuth flow and credential removal", async () => {
    const server = {
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
    };
    startAuthMutateAsync.mockResolvedValue({
      authorizationUrl: "https://provider.example.com/authorize?client_id=abc",
    });
    removeAuthMutateAsync.mockResolvedValue({ success: true });
    const refetch = vi.fn().mockResolvedValue({ data: [server] });
    vi.mocked(useMcpServersQuery).mockReturnValue({
      data: [server],
      isLoading: false,
      error: null,
      refetch,
    } as never);

    render(<IntegrationsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Re-authenticate" }));
    fireEvent.click(screen.getByRole("button", { name: "Authenticate" }));

    // Starts the hosted flow and opens the provider sign-in in a new tab.
    await waitFor(() => {
      expect(startAuthMutateAsync).toHaveBeenCalledWith({ id: "mcp-1" });
    });
    expect(window.open).toHaveBeenCalledWith(
      "https://provider.example.com/authorize?client_id=abc",
      "_blank",
      "noopener,noreferrer",
    );

    // Polling detects the connected status and closes the dialog.
    fireEvent.click(screen.getByRole("button", { name: "Check now" }));
    await waitFor(() => {
      expect(refetch).toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: "Check now" })).not.toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Add Jira" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Sentry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Vercel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Supabase" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add n8n" })).toBeInTheDocument();
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

  it("disables Composio actions while a mutation is pending", () => {
    mockConfiguredComposio({
      enabled: true,
      requiresEngineRestart: false,
      authMethod: "oauth",
    });
    vi.mocked(useMcpServerMutations).mockReturnValue({
      create: { mutateAsync: createMutateAsync, isPending: false },
      update: { mutateAsync: updateMutateAsync, isPending: false },
      setEnabled: { mutateAsync: setEnabledMutateAsync, isPending: false },
      activate: { mutateAsync: activateMutateAsync, isPending: false, error: null },
      remove: { mutateAsync: removeMutateAsync, isPending: true },
      startAuth: { mutateAsync: startAuthMutateAsync, isPending: false },
      completeAuth: { mutateAsync: completeAuthMutateAsync, isPending: false },
      authenticate: { mutateAsync: authenticateMutateAsync, isPending: false },
      removeAuth: { mutateAsync: removeAuthMutateAsync, isPending: false },
      refresh: { mutate: vi.fn(), isPending: false },
    } as never);

    render(<IntegrationsPage />);

    const composioSection = screen
      .getByRole("heading", { name: "Composio" })
      .closest("section") as HTMLElement;

    expect(within(composioSection).getByRole("button", { name: "Re-authenticate" })).toBeDisabled();
    expect(within(composioSection).getByRole("button", { name: "Remove auth" })).toBeDisabled();
    expect(within(composioSection).getByRole("button", { name: "Updating..." })).toBeDisabled();
    expect(within(composioSection).getByRole("button", { name: "Remove" })).toBeDisabled();
  });

  it("removes Composio from the dedicated section", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledWith("Remove Composio connection 'composio'?");
      expect(removeMutateAsync).toHaveBeenCalledWith({ id: "mcp-composio" });
    });
  });

  it("prefills the add MCP server dialog from a suggestion", () => {
    render(<IntegrationsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add Notion" }));

    expect(screen.getByLabelText("Name")).toHaveValue("notion");
    expect(screen.getByLabelText("URL")).toHaveValue("https://mcp.notion.com/mcp");
    expect(screen.getByRole("combobox", { name: "Auth method" })).toHaveTextContent("oauth");
  });

  it("prefills the Playwright suggestion for headless container execution", () => {
    render(<IntegrationsPage />);

    fireEvent.change(screen.getByLabelText("Search suggested MCPs"), {
      target: { value: "playwright" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Playwright" }));

    expect(screen.getByLabelText("Command")).toHaveValue(
      "npx\n-y\n@playwright/mcp@latest\n--headless\n--browser\nchromium",
    );
  });

  it("prefills the validated Mermaid environment in Docker", () => {
    render(<IntegrationsPage />);

    fireEvent.change(screen.getByLabelText("Search suggested MCPs"), {
      target: { value: "mermaid" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Mermaid" }));

    expect(screen.getByLabelText("Environment")).toHaveValue(
      "npm_config_cache=/workspace/.cc/npm-cache\n" +
        "npm_config_ignore_scripts=true\n" +
        "PLAYWRIGHT_BROWSERS_PATH=/ms-playwright",
    );
  });

  it("keeps Mermaid lifecycle scripts enabled outside Docker", () => {
    vi.mocked(useSystemVersionQuery).mockReturnValue({
      data: {
        current: "1.0.0",
        updateAvailable: false,
        installMode: "npm-global",
        autoUpdateEnabled: false,
        autoUpdateSource: "environment",
      },
      isLoading: false,
      error: null,
    } as never);
    render(<IntegrationsPage />);

    fireEvent.change(screen.getByLabelText("Search suggested MCPs"), {
      target: { value: "mermaid" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Mermaid" }));

    expect(screen.getByLabelText("Environment")).toHaveValue("");
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

  it("duplicates an MCP server into the add dialog with a unique name", () => {
    vi.mocked(useMcpServersQuery).mockReturnValue({
      data: [
        {
          id: "mcp-1",
          name: "github",
          enabled: true,
          config: {
            url: "https://api.githubcopilot.com/mcp/",
            transport: "streamable-http",
            authMethod: "headers",
            headers: [{ key: "Authorization", value: "Bearer {env:GITHUB_TOKEN}" }],
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

    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));

    expect(screen.getByRole("heading", { name: "Add MCP server" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("github-2");
    expect(screen.getByLabelText("URL")).toHaveValue("https://api.githubcopilot.com/mcp/");
    expect(screen.getByLabelText("Headers")).toHaveValue(
      "Authorization: Bearer {env:GITHUB_TOKEN}",
    );
  });

  it("blocks submitting an MCP server with a name already in use", () => {
    vi.mocked(useMcpServersQuery).mockReturnValue({
      data: [
        {
          id: "mcp-1",
          name: "github",
          enabled: true,
          config: {
            url: "https://api.githubcopilot.com/mcp/",
            transport: "streamable-http",
            authMethod: "headers",
            headers: [{ key: "Authorization", value: "Bearer {env:GITHUB_TOKEN}" }],
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

    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    // Force the duplicated name back to the existing one (case-insensitive).
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "GitHub" } });
    fireEvent.click(screen.getByRole("button", { name: "Add server" }));

    expect(screen.getByText("An MCP server named 'github' already exists.")).toBeInTheDocument();
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it("blocks editing one server onto another that differs only by case", () => {
    vi.mocked(useMcpServersQuery).mockReturnValue({
      data: [
        {
          id: "mcp-1",
          name: "github",
          enabled: true,
          config: {
            url: "https://api.githubcopilot.com/mcp/",
            transport: "streamable-http",
            authMethod: "headers",
            headers: [{ key: "Authorization", value: "Bearer {env:GITHUB_TOKEN}" }],
          },
          runtimeStatus: { status: "connected" },
          tools: [],
          createdAt: "2026-04-22T10:00:00.000Z",
          updatedAt: "2026-04-22T10:00:00.000Z",
        },
        {
          id: "mcp-2",
          name: "GitHub",
          enabled: true,
          config: {
            url: "https://api.githubcopilot.com/mcp/",
            transport: "streamable-http",
            authMethod: "headers",
            headers: [{ key: "Authorization", value: "Bearer {env:GITHUB_TOKEN_2}" }],
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

    // Edit the lowercase "github" server and rename it to the other's exact name.
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]!);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "GitHub" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(screen.getByText("An MCP server named 'github' already exists.")).toBeInTheDocument();
    expect(updateMutateAsync).not.toHaveBeenCalled();
  });

  it("renders custom MCP servers across states and drives their card actions", async () => {
    const base = {
      enabled: true,
      config: {
        url: "https://example.com/mcp",
        transport: "streamable-http" as const,
        authMethod: "oauth" as const,
        headers: [],
      },
      missingSecrets: [] as string[],
      tools: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    vi.mocked(useMcpServersQuery).mockReturnValue({
      data: [
        { ...base, id: "c1", name: "connected-srv", runtimeStatus: { status: "connected" } },
        { ...base, id: "c2", name: "needsauth-srv", runtimeStatus: { status: "needs_auth" } },
        {
          ...base,
          id: "c3",
          name: "failed-srv",
          missingSecrets: ["OPENAI_KEY"],
          runtimeStatus: { status: "failed", error: "boom failure" },
        },
        {
          ...base,
          id: "c4",
          name: "stdio-srv",
          enabled: false,
          config: { transport: "stdio", command: ["node", "server.js"], environment: {} },
          runtimeStatus: { status: "disabled" },
        },
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    const user = userEvent.setup();
    render(<IntegrationsPage />);

    expect(screen.getByRole("heading", { name: "connected-srv" })).toBeInTheDocument();
    expect(screen.getByText("boom failure")).toBeInTheDocument();
    expect(screen.getByText("Missing secret values")).toBeInTheDocument();

    const connectedCard = screen
      .getByRole("heading", { name: "connected-srv" })
      .closest("article") as HTMLElement;

    await user.click(within(connectedCard).getByRole("button", { name: "Remove auth" }));
    await waitFor(() => expect(removeAuthMutateAsync).toHaveBeenCalledWith({ id: "c1" }));

    await user.click(within(connectedCard).getByRole("button", { name: "Disable" }));
    await waitFor(() =>
      expect(setEnabledMutateAsync).toHaveBeenCalledWith({ id: "c1", enabled: false }),
    );

    await user.click(within(connectedCard).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(removeMutateAsync).toHaveBeenCalledWith({ id: "c1" }));

    // A needs_auth server offers Authenticate (not Re-authenticate).
    const needsAuthCard = screen
      .getByRole("heading", { name: "needsauth-srv" })
      .closest("article") as HTMLElement;
    expect(within(needsAuthCard).getByRole("button", { name: "Authenticate" })).toBeInTheDocument();

    // A stdio server exposes no auth buttons, only Enable.
    const stdioCard = screen
      .getByRole("heading", { name: "stdio-srv" })
      .closest("article") as HTMLElement;
    expect(
      within(stdioCard).queryByRole("button", { name: "Authenticate" }),
    ).not.toBeInTheDocument();
    expect(within(stdioCard).getByRole("button", { name: "Enable" })).toBeInTheDocument();
  });

  it("manages an existing Composio server through its card actions", async () => {
    vi.mocked(useMcpServersQuery).mockReturnValue({
      data: [
        {
          id: "composio-1",
          name: "composio",
          enabled: true,
          config: {
            url: "https://connect.composio.dev/mcp",
            transport: "streamable-http",
            authMethod: "oauth",
            headers: [],
          },
          runtimeStatus: { status: "connected" },
          missingSecrets: [],
          tools: [],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as never);
    authenticateMutateAsync.mockResolvedValue({ name: "composio" });
    removeMutateAsync.mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<IntegrationsPage />);

    const composioSection = screen
      .getByRole("heading", { name: "Composio" })
      .closest("section") as HTMLElement;

    await user.click(within(composioSection).getByRole("button", { name: "Re-authenticate" }));
    await waitFor(() => expect(authenticateMutateAsync).toHaveBeenCalledWith({ id: "composio-1" }));

    await user.click(within(composioSection).getByRole("button", { name: "Remove auth" }));
    await waitFor(() => expect(removeAuthMutateAsync).toHaveBeenCalledWith({ id: "composio-1" }));

    await user.click(within(composioSection).getByRole("button", { name: "Disable" }));
    await waitFor(() =>
      expect(setEnabledMutateAsync).toHaveBeenCalledWith({ id: "composio-1", enabled: false }),
    );

    await user.click(within(composioSection).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(removeMutateAsync).toHaveBeenCalledWith({ id: "composio-1" }));
  });
});

function openCcInstanceDialog(values: {
  name: string;
  url: string;
  token: string;
  secretKey?: string;
}): void {
  fireEvent.click(screen.getByRole("button", { name: "Add CC instance" }));
  fireEvent.change(screen.getByLabelText("CC instance name"), { target: { value: values.name } });
  fireEvent.change(screen.getByLabelText("CC instance URL"), { target: { value: values.url } });

  if (values.secretKey !== undefined) {
    fireEvent.change(screen.getByLabelText("CC instance secret name"), {
      target: { value: values.secretKey },
    });
  }

  fireEvent.change(screen.getByLabelText("CC instance API token"), {
    target: { value: values.token },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save instance" }));
}

function mockCcInstance(options: {
  enabled?: boolean;
  requiresEngineRestart?: boolean;
  missingSecrets?: string[];
}): void {
  vi.mocked(useMcpServersQuery).mockReturnValue({
    data: [
      {
        id: "mcp-instance",
        name: "staging-cc",
        enabled: options.enabled ?? false,
        config: {
          url: "https://cc.example.com/api/public/mcp",
          transport: "streamable-http",
          authMethod: "headers",
          headers: [{ key: "Authorization", value: "Bearer {env:CC_INSTANCE_STAGING_CC_TOKEN}" }],
        },
        missingSecrets: options.missingSecrets ?? [],
        requiresEngineRestart: options.requiresEngineRestart ?? false,
        runtimeStatus: { status: options.enabled ? "connected" : "disabled" },
        tools: [],
        createdAt: "2026-04-22T10:00:00.000Z",
        updatedAt: "2026-04-22T10:00:00.000Z",
      },
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  } as never);
}

function composioSection(): HTMLElement {
  return screen.getByRole("heading", { name: "Composio" }).closest("section") as HTMLElement;
}

function mockComposioConnections(
  names: string[],
  options: { enabled?: boolean; requiresEngineRestart?: boolean } = {},
): void {
  const enabled = options.enabled ?? true;

  vi.mocked(useMcpServersQuery).mockReturnValue({
    data: names.map((name) => ({
      id: `mcp-${name}`,
      name,
      enabled,
      config: {
        url: "https://connect.composio.dev/mcp",
        transport: "streamable-http",
        authMethod: "headers",
        headers: [{ key: "x-consumer-api-key", value: `{env:CC_MCP_${name}_KEY}` }],
      },
      missingSecrets: [],
      requiresEngineRestart: options.requiresEngineRestart ?? false,
      runtimeStatus: { status: enabled ? "connected" : "disabled" },
      tools: [],
      createdAt: "2026-04-22T10:00:00.000Z",
      updatedAt: "2026-04-22T10:00:00.000Z",
    })),
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  } as never);
}

function mockConfiguredComposio(options: {
  enabled: boolean;
  requiresEngineRestart: boolean;
  authMethod?: "headers" | "oauth";
}): void {
  vi.mocked(useMcpServersQuery).mockReturnValue({
    data: [
      {
        id: "mcp-composio",
        name: "composio",
        enabled: options.enabled,
        config:
          options.authMethod === "oauth"
            ? {
                url: "https://connect.composio.dev/mcp",
                transport: "streamable-http",
                authMethod: "oauth",
                headers: [],
              }
            : {
                url: "https://connect.composio.dev/mcp",
                transport: "streamable-http",
                authMethod: "headers",
                headers: [{ key: "x-consumer-api-key", value: "{env:CC_MCP_COMPOSIO_API_KEY}" }],
              },
        missingSecrets: [],
        requiresEngineRestart: options.requiresEngineRestart,
        runtimeStatus: { status: options.enabled ? "connected" : "disabled" },
        tools: [],
        createdAt: "2026-04-22T10:00:00.000Z",
        updatedAt: "2026-04-22T10:00:00.000Z",
      },
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  } as never);
}
