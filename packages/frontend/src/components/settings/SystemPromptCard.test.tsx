import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SystemPromptDetail, SystemPromptListItem } from "@cc/shared/schemas";

import { SystemPromptCard } from "./SystemPromptCard";

import * as api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getSystemPrompt: vi.fn(),
  saveSystemPrompt: vi.fn(),
  resetSystemPrompt: vi.fn(),
  getSystemPrompts: vi.fn(),
}));

// Replace Monaco with a minimal controlled harness so we can drive draft/save.
vi.mock("@/components/workspace/MonacoFileEditor", () => ({
  MonacoFileEditor: ({
    draft,
    dirty,
    onDraftChange,
    onSaveRequested,
  }: {
    draft: string;
    dirty: boolean;
    onDraftChange: (value: string) => void;
    onSaveRequested: () => void;
  }) => (
    <div>
      <textarea
        data-testid="editor"
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
      />
      <span data-testid="dirty">{String(dirty)}</span>
      <button type="button" onClick={() => onSaveRequested()}>
        EditorSave
      </button>
    </div>
  ),
}));

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function listItem(overrides: Partial<SystemPromptListItem> & { id: string }): SystemPromptListItem {
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

function detail(overrides: Partial<SystemPromptDetail> & { id: string }): SystemPromptDetail {
  const { id, ...rest } = overrides;
  return {
    definition: {
      id,
      title: id,
      description: "",
      scope: "both",
      order: 10,
      optional: false,
      danger: false,
      enabledByDefault: true,
      variables: [],
    },
    body: "default body",
    defaultBody: "default body",
    isCustomized: false,
    ...rest,
  };
}

beforeEach(() => {
  vi.mocked(api.getSystemPrompt).mockReset();
  vi.mocked(api.saveSystemPrompt).mockReset();
  vi.mocked(api.resetSystemPrompt).mockReset();
});

describe("SystemPromptCard", () => {
  it("fetches the body on expand and saves an edit", async () => {
    vi.mocked(api.getSystemPrompt).mockResolvedValue(detail({ id: "identity", body: "hello" }));
    vi.mocked(api.saveSystemPrompt).mockResolvedValue(
      detail({ id: "identity", body: "edited", isCustomized: true }),
    );

    render(
      <SystemPromptCard prompt={listItem({ id: "identity", title: "Identity" })} variables={[]} />,
      { wrapper: makeWrapper() },
    );

    fireEvent.click(screen.getByText("Identity"));

    await waitFor(() => {
      expect(api.getSystemPrompt).toHaveBeenCalledWith("identity");
    });
    const editor = await screen.findByTestId("editor");
    expect(editor).toHaveValue("hello");

    fireEvent.change(editor, { target: { value: "edited" } });
    expect(screen.getByTestId("dirty")).toHaveTextContent("true");

    fireEvent.click(screen.getByText("EditorSave"));
    await waitFor(() => {
      expect(api.saveSystemPrompt).toHaveBeenCalledWith("identity", "edited");
    });
  });

  it("confirms then resets a customized prompt to default", async () => {
    vi.mocked(api.getSystemPrompt).mockResolvedValue(
      detail({ id: "identity", body: "custom", isCustomized: true }),
    );
    vi.mocked(api.resetSystemPrompt).mockResolvedValue(detail({ id: "identity" }));

    render(
      <SystemPromptCard
        prompt={listItem({ id: "identity", title: "Identity", isCustomized: true })}
        variables={[]}
      />,
      { wrapper: makeWrapper() },
    );

    fireEvent.click(screen.getByText("Identity"));
    const resetButton = await screen.findByRole("button", { name: "Reset to default" });
    fireEvent.click(resetButton);

    // Confirm dialog appears; confirm it.
    fireEvent.click(screen.getByText("Reset Identity to default?"));
    fireEvent.click(screen.getAllByRole("button", { name: "Reset to default" }).at(-1)!);

    await waitFor(() => {
      expect(api.resetSystemPrompt).toHaveBeenCalledWith("identity");
    });
  });

  it("shows the empty-allowed hint for the optional Additional prompt", async () => {
    vi.mocked(api.getSystemPrompt).mockResolvedValue(detail({ id: "additional", body: "" }));

    render(
      <SystemPromptCard
        prompt={listItem({ id: "additional", title: "Additional", optional: true })}
        variables={[]}
      />,
      { wrapper: makeWrapper() },
    );

    fireEvent.click(screen.getByText("Additional"));
    expect(
      await screen.findByText(/empty Additional prompt is simply not sent/i),
    ).toBeInTheDocument();
  });
});
