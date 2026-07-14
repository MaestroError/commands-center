import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ResolvedSystemPrompt } from "@cc/shared/schemas";

import { SystemPromptsTab } from "./SystemPromptsTab";

import * as api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getConversationSystemPrompts: vi.fn(),
  setConversationSystemPromptEnabled: vi.fn(),
}));

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const prompts: ResolvedSystemPrompt[] = [
  {
    id: "identity",
    title: "Identity",
    description: "",
    scope: "both",
    danger: true,
    optional: false,
    enabled: true,
    isCustomized: false,
    renderedBody: "You are Ada.",
  },
  {
    id: "additional",
    title: "Additional",
    description: "",
    scope: "both",
    danger: false,
    optional: true,
    enabled: true,
    isCustomized: false,
    renderedBody: "",
  },
];

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(api.getConversationSystemPrompts).mockReset();
  vi.mocked(api.setConversationSystemPromptEnabled).mockReset();
});

describe("SystemPromptsTab", () => {
  it("renders prompt cards without danger badges", async () => {
    vi.mocked(api.getConversationSystemPrompts).mockResolvedValue(prompts);

    render(<SystemPromptsTab conversationId="conv-1" />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Identity")).toBeInTheDocument();
    });
    expect(screen.queryByText("Danger")).not.toBeInTheDocument();

    expect(screen.getByText("Additional")).toBeInTheDocument();
  });

  it("shows the empty hint for an expanded optional prompt", async () => {
    vi.mocked(api.getConversationSystemPrompts).mockResolvedValue(prompts);

    render(<SystemPromptsTab conversationId="conv-1" />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Additional")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Additional"));
    expect(screen.getByText(/not configured/i)).toBeInTheDocument();
  });

  it("toggles a prompt via the API", async () => {
    vi.mocked(api.getConversationSystemPrompts).mockResolvedValue(prompts);
    vi.mocked(api.setConversationSystemPromptEnabled).mockResolvedValue(
      prompts.map((prompt) => (prompt.id === "identity" ? { ...prompt, enabled: false } : prompt)),
    );

    render(<SystemPromptsTab conversationId="conv-1" />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Identity")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Toggle Identity"));

    await waitFor(() => {
      expect(api.setConversationSystemPromptEnabled).toHaveBeenCalledWith(
        "conv-1",
        "identity",
        false,
      );
    });
  });
});
