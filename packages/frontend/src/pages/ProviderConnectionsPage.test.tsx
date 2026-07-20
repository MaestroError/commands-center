import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProviderConnectionsPage } from "./ProviderConnectionsPage";

import { useProviderMutations, useProvidersQuery } from "@/hooks/use-providers-query";

vi.mock("@/hooks/use-providers-query", () => ({
  useProvidersQuery: vi.fn(),
  useProviderMutations: vi.fn(),
}));

const refetchSpy = vi.fn();
const connectApiKeyMutateAsync = vi.fn();
const startOauthMutateAsync = vi.fn();
const completeOauthMutateAsync = vi.fn();
const disconnectMutateAsync = vi.fn();
const windowOpenSpy = vi.fn();

beforeEach(() => {
  refetchSpy.mockReset();
  connectApiKeyMutateAsync.mockReset();
  startOauthMutateAsync.mockReset();
  completeOauthMutateAsync.mockReset();
  disconnectMutateAsync.mockReset();
  windowOpenSpy.mockReset();

  vi.spyOn(window, "open").mockImplementation(windowOpenSpy);

  vi.mocked(useProvidersQuery).mockReturnValue({
    data: [buildProvider()],
    isLoading: false,
    error: null,
    refetch: refetchSpy,
  } as never);
  vi.mocked(useProviderMutations).mockReturnValue({
    connectApiKey: { mutateAsync: connectApiKeyMutateAsync },
    startOauth: { mutateAsync: startOauthMutateAsync },
    completeOauth: { mutateAsync: completeOauthMutateAsync },
    disconnect: { mutateAsync: disconnectMutateAsync },
  } as never);
});

describe("ProviderConnectionsPage", () => {
  it("renders query errors and lets the user retry", () => {
    vi.mocked(useProvidersQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("provider load failed"),
      refetch: refetchSpy,
    } as never);

    render(<ProviderConnectionsPage />);

    expect(screen.getByText("Provider data could not be loaded.")).toBeInTheDocument();
    expect(screen.getByText("provider load failed")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(refetchSpy).toHaveBeenCalledOnce();
  });

  it("renders empty states when there are no connected models or providers", () => {
    vi.mocked(useProvidersQuery).mockReturnValue({
      data: [buildProvider({ connected: false, models: [] })],
      isLoading: false,
      error: null,
      refetch: refetchSpy,
    } as never);

    const { unmount } = render(<ProviderConnectionsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Expand available models" }));
    expect(screen.getByText("No connected provider models yet.")).toBeInTheDocument();
    expect(screen.getByText("Connect API key")).toBeInTheDocument();

    unmount();

    vi.mocked(useProvidersQuery).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: refetchSpy,
    } as never);

    render(<ProviderConnectionsPage />);

    expect(screen.getByText("Nothing to connect yet.")).toBeInTheDocument();
  });

  it("renders connected provider cards, model summaries, and disconnects providers", async () => {
    disconnectMutateAsync.mockResolvedValue(undefined);
    vi.mocked(useProvidersQuery).mockReturnValue({
      data: [
        buildProvider({
          connected: true,
          models: [
            buildModel("gpt-4o", "GPT-4o"),
            buildModel("gpt-4.1", "GPT-4.1"),
            buildModel("o3", "o3"),
            buildModel("o4-mini", "o4-mini"),
            buildModel("gpt-4.1-mini", "GPT-4.1 Mini"),
          ],
        }),
      ],
      isLoading: false,
      error: null,
      refetch: refetchSpy,
    } as never);

    render(<ProviderConnectionsPage />);

    expect(screen.getByText("5 connected models")).toBeInTheDocument();
    expect(screen.getByText("+1 more")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update API key" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reconnect OAuth" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

    await waitFor(() => {
      expect(disconnectMutateAsync).toHaveBeenCalledWith({ providerId: "openai" });
    });
  });

  it("collapses the models section by default and filters models when expanded", () => {
    vi.mocked(useProvidersQuery).mockReturnValue({
      data: [
        buildProvider({
          connected: true,
          models: [buildModel("gpt-4o", "GPT-4o"), buildModel("claude-opus", "Claude Opus")],
        }),
      ],
      isLoading: false,
      error: null,
      refetch: refetchSpy,
    } as never);

    render(<ProviderConnectionsPage />);

    // Collapsed by default: the model search and model grid (model ids) are not rendered.
    // Model names render as chips on the provider card, so assert on the grid-only model ids.
    expect(screen.queryByLabelText("Search models")).not.toBeInTheDocument();
    expect(screen.queryByText("gpt-4o")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand available models" }));

    expect(screen.getByText("gpt-4o")).toBeInTheDocument();
    expect(screen.getByText("claude-opus")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search models"), { target: { value: "gpt" } });

    expect(screen.getByText("gpt-4o")).toBeInTheDocument();
    expect(screen.queryByText("claude-opus")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search models"), { target: { value: "no-match" } });

    expect(screen.getByText("No matching models")).toBeInTheDocument();
  });

  it("filters provider cards by the search query", () => {
    vi.mocked(useProvidersQuery).mockReturnValue({
      data: [buildProvider(), buildProvider({ provider: { id: "anthropic", name: "Anthropic" } })],
      isLoading: false,
      error: null,
      refetch: refetchSpy,
    } as never);

    render(<ProviderConnectionsPage />);

    expect(screen.getByRole("heading", { name: "OpenAI" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Anthropic" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search providers"), {
      target: { value: "anthro" },
    });

    expect(screen.queryByRole("heading", { name: "OpenAI" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Anthropic" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search providers"), {
      target: { value: "no-match" },
    });

    expect(screen.getByText("No matching providers")).toBeInTheDocument();
  });

  it("connects a provider with an API key and shows the success state", async () => {
    connectApiKeyMutateAsync.mockResolvedValue(true);

    render(<ProviderConnectionsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Connect API key" }));

    const saveButton = screen.getByRole("button", { name: "Save key" });
    expect(saveButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("API key"), { target: { value: "sk-test" } });
    fireEvent.click(screen.getByRole("button", { name: "Save key" }));

    await waitFor(() => {
      expect(connectApiKeyMutateAsync).toHaveBeenCalledWith({
        providerId: "openai",
        apiKey: "sk-test",
      });
    });

    expect(screen.getAllByText("Provider connected successfully").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.getByText("OpenAI connected.")).toBeInTheDocument();
  });

  it("starts and completes a manual oauth flow with filtered prompts", async () => {
    const user = userEvent.setup();
    startOauthMutateAsync.mockResolvedValue({
      url: "https://example.com/oauth",
      method: "code",
      instructions: "Complete the login.",
    });
    completeOauthMutateAsync.mockResolvedValue({
      connected: true,
      message: "OpenAI OAuth connected.",
    });

    render(<ProviderConnectionsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Connect OAuth" }));

    await user.click(screen.getByRole("combobox", { name: "Choose region" }));
    await user.click(await screen.findByRole("option", { name: "EU" }));
    fireEvent.change(screen.getByLabelText("Workspace slug"), {
      target: { value: "workspace-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Open provider login" }));

    await waitFor(() => {
      expect(startOauthMutateAsync).toHaveBeenCalledWith({
        providerId: "openai",
        method: 1,
        inputs: {
          region: "eu",
          workspace: "workspace-1",
        },
      });
    });

    expect(windowOpenSpy).toHaveBeenCalledWith(
      "https://example.com/oauth",
      "_blank",
      "noopener,noreferrer",
    );
    expect(screen.getByText("Mode: code")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Manual code or callback value"), {
      target: { value: "oauth-code" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Complete OAuth" }));

    await waitFor(() => {
      expect(completeOauthMutateAsync).toHaveBeenCalledWith({
        providerId: "openai",
        method: 1,
        code: "oauth-code",
      });
    });

    expect(screen.getByText("OpenAI OAuth connected.")).toBeInTheDocument();
  });

  it("polls until an automatic oauth flow connects", async () => {
    vi.useFakeTimers();
    startOauthMutateAsync.mockResolvedValue({
      url: "https://example.com/oauth",
      method: "auto",
      instructions: "Waiting for callback.",
    });
    completeOauthMutateAsync
      .mockResolvedValueOnce({ connected: false, pending: true })
      .mockResolvedValueOnce({ connected: true, message: "OpenAI connected automatically." });

    try {
      render(<ProviderConnectionsPage />);
      fireEvent.click(screen.getByRole("button", { name: "Connect OAuth" }));
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Open provider login" }));
        await Promise.resolve();
      });

      expect(startOauthMutateAsync).toHaveBeenCalled();
      expect(screen.getByText("Waiting for provider confirmation...")).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(completeOauthMutateAsync).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(completeOauthMutateAsync).toHaveBeenCalledTimes(2);

      expect(screen.getByText("OpenAI connected automatically.")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("hides the manual code form for automatic oauth flows", async () => {
    startOauthMutateAsync.mockResolvedValue({
      url: "https://example.com/oauth",
      method: "auto",
      instructions: "Waiting for callback.",
    });
    completeOauthMutateAsync.mockResolvedValue({ connected: false, pending: true });

    render(<ProviderConnectionsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Connect OAuth" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Open provider login" }));
      await Promise.resolve();
    });

    // Auto flows complete via polling; opencode ignores any pasted code, so the
    // misleading manual-code form must not be offered.
    expect(screen.queryByLabelText("Manual code or callback value")).not.toBeInTheDocument();
    expect(screen.getByText("Waiting for provider confirmation...")).toBeInTheDocument();
  });

  it("lets the user choose between multiple oauth methods", async () => {
    vi.mocked(useProvidersQuery).mockReturnValue({
      data: [
        buildProvider({
          authMethods: [
            { type: "api", label: "API key" },
            { type: "oauth", label: "ChatGPT Pro/Plus (browser)" },
            { type: "oauth", label: "ChatGPT Pro/Plus (headless)" },
          ],
        }),
      ],
      isLoading: false,
      error: null,
      refetch: refetchSpy,
    } as never);
    startOauthMutateAsync.mockResolvedValue({
      url: "https://example.com/device",
      method: "auto",
      instructions: "Enter code: ABCD-1234",
    });
    completeOauthMutateAsync.mockResolvedValue({ connected: false, pending: true });

    render(<ProviderConnectionsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Connect OAuth" }));

    // The browser method is selected by default (first oauth method).
    expect(screen.getByLabelText("ChatGPT Pro/Plus (browser)")).toBeChecked();

    fireEvent.click(screen.getByLabelText("ChatGPT Pro/Plus (headless)"));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Open provider login" }));
      await Promise.resolve();
    });

    expect(startOauthMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: "openai", method: 2 }),
    );
  });

  it("resets an in-flight session and stops polling when switching oauth methods", async () => {
    vi.useFakeTimers();
    vi.mocked(useProvidersQuery).mockReturnValue({
      data: [
        buildProvider({
          authMethods: [
            { type: "api", label: "API key" },
            { type: "oauth", label: "ChatGPT Pro/Plus (browser)" },
            { type: "oauth", label: "ChatGPT Pro/Plus (headless)" },
          ],
        }),
      ],
      isLoading: false,
      error: null,
      refetch: refetchSpy,
    } as never);
    startOauthMutateAsync.mockResolvedValue({
      url: "https://example.com/oauth",
      method: "auto",
      instructions: "Waiting for callback.",
    });
    completeOauthMutateAsync.mockResolvedValue({ connected: false, pending: true });

    try {
      render(<ProviderConnectionsPage />);
      fireEvent.click(screen.getByRole("button", { name: "Connect OAuth" }));
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Open provider login" }));
        await Promise.resolve();
      });

      // Let one poll tick run so polling is active and the dialog is idle again.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(screen.getByText("Waiting for provider confirmation...")).toBeInTheDocument();
      const callsBeforeSwitch = completeOauthMutateAsync.mock.calls.length;

      // Switching methods must abandon the in-flight session and clear the poll interval.
      fireEvent.click(screen.getByLabelText("ChatGPT Pro/Plus (headless)"));

      expect(screen.getByLabelText("ChatGPT Pro/Plus (headless)")).toBeChecked();
      expect(screen.queryByText("Waiting for provider confirmation...")).not.toBeInTheDocument();

      // No further polling should happen after the switch.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000);
      });
      expect(completeOauthMutateAsync.mock.calls.length).toBe(callsBeforeSwitch);
    } finally {
      vi.useRealTimers();
    }
  });
});

function buildProvider(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    provider: { id: "openai", name: "OpenAI" },
    connected: false,
    defaultModel: null,
    models: [buildModel("gpt-4o", "GPT-4o")],
    authMethods: [
      { type: "api", label: "API key" },
      {
        type: "oauth",
        label: "OAuth",
        prompts: [
          {
            key: "region",
            type: "select",
            message: "Choose region",
            options: [
              { value: "us", label: "US" },
              { value: "eu", label: "EU" },
            ],
          },
          {
            key: "workspace",
            type: "text",
            message: "Workspace slug",
            placeholder: "workspace-name",
            when: { key: "region", op: "eq", value: "eu" },
          },
          {
            key: "ignored",
            type: "text",
            message: "Ignored prompt",
            when: { key: "region", op: "neq", value: "eu" },
          },
        ],
      },
    ],
    ...overrides,
  };
}

function buildModel(id: string, name: string) {
  return {
    id,
    name,
    providerId: "openai",
  };
}
