import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SystemPromptListItem } from "@cc/shared/schemas";

import { SystemPromptsTab } from "./SystemPromptsTab";

import * as api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getSystemPrompts: vi.fn(),
  getSystemPrompt: vi.fn(),
  saveSystemPrompt: vi.fn(),
  resetSystemPrompt: vi.fn(),
}));

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function item(overrides: Partial<SystemPromptListItem> & { id: string }): SystemPromptListItem {
  return {
    title: overrides.id,
    description: "",
    scope: "both",
    order: 10,
    optional: false,
    danger: false,
    enabledByDefault: true,
    variables: [],
    isCustomized: false,
    ...overrides,
  };
}

// Registry order from the backend — the tab must re-sort to display order.
const prompts: SystemPromptListItem[] = [
  item({ id: "identity", title: "Identity", danger: true }),
  item({ id: "global-chat", title: "Global (Chat)", danger: true }),
  item({ id: "global-task", title: "Global (Task)", danger: true }),
  item({ id: "additional", title: "Additional", optional: true, danger: false }),
];

beforeEach(() => {
  vi.mocked(api.getSystemPrompts).mockReset();
});

describe("settings SystemPromptsTab", () => {
  it("renders the cards in display order with Additional first", async () => {
    vi.mocked(api.getSystemPrompts).mockResolvedValue({ prompts, variables: [] });

    const { container } = render(<SystemPromptsTab />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Additional")).toBeInTheDocument();
    });

    const text = container.textContent ?? "";
    expect(text.indexOf("Additional")).toBeLessThan(text.indexOf("Global (Chat)"));
    expect(text.indexOf("Global (Chat)")).toBeLessThan(text.indexOf("Global (Task)"));
    expect(text.indexOf("Global (Task)")).toBeLessThan(text.indexOf("Identity"));
  });

  it("shows the danger note only on the danger prompts", async () => {
    vi.mocked(api.getSystemPrompts).mockResolvedValue({ prompts, variables: [] });

    render(<SystemPromptsTab />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Identity")).toBeInTheDocument();
    });

    expect(
      screen.getAllByText("Editing this affects every specialist and core behaviour."),
    ).toHaveLength(3);
  });
});
