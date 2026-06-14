import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LiveRequest } from "@cc/shared/schemas";

import { useSpecialistCatalogQuery, useAgentsQuery } from "@/hooks/use-agents-query";
import { useAgentCustomToolsQuery, useCustomToolsQuery } from "@/hooks/use-custom-tools-query";
import { useMcpServersQuery } from "@/hooks/use-mcp-servers-query";

import { isLiveRequestReviewKind } from "./live-request-helpers";
import { LiveRequestReviewForm } from "./LiveRequestReviewForm";

vi.mock("@/hooks/use-agents-query", () => ({
  useSpecialistCatalogQuery: vi.fn(),
  useAgentsQuery: vi.fn(),
}));

vi.mock("@/hooks/use-mcp-servers-query", () => ({
  useMcpServersQuery: vi.fn(),
}));

vi.mock("@/hooks/use-custom-tools-query", () => ({
  useCustomToolsQuery: vi.fn(),
  useAgentCustomToolsQuery: vi.fn(),
}));

const catalog = {
  builtInSkills: [],
  workspaceSkills: [],
  providerModels: [
    { id: "anthropic/claude-opus-4-8", label: "Claude Opus 4.8" },
    { id: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  ],
  mcpServers: [],
  appMcpServers: [],
  customTools: [],
};

function emptyQuery<T>(data: T) {
  return { data, isLoading: false, error: null } as never;
}

beforeEach(() => {
  vi.mocked(useSpecialistCatalogQuery).mockReturnValue(emptyQuery(catalog));
  vi.mocked(useAgentsQuery).mockReturnValue(emptyQuery([]));
  vi.mocked(useMcpServersQuery).mockReturnValue(emptyQuery([]));
  vi.mocked(useCustomToolsQuery).mockReturnValue(emptyQuery([]));
  vi.mocked(useAgentCustomToolsQuery).mockReturnValue(emptyQuery([]));
});

function renderForm(request: LiveRequest, onResolve = vi.fn().mockResolvedValue(undefined)) {
  render(
    <MemoryRouter>
      <LiveRequestReviewForm request={request} onResolve={onResolve} onCancel={vi.fn()} />
    </MemoryRouter>,
  );
  return { onResolve };
}

function field(
  name: string,
  label: string,
  defaultValue: string,
  type: "text" | "textarea" = "text",
) {
  return { type, name, label, required: name !== "iconPath", defaultValue };
}

const reviewActions = [
  {
    id: "submit",
    label: "Apply",
    variant: "primary" as const,
    kind: "submit" as const,
    disabledWhen: [],
  },
  {
    id: "cancel",
    label: "Cancel",
    variant: "secondary" as const,
    kind: "cancel" as const,
    disabledWhen: [],
  },
];

describe("isLiveRequestReviewKind", () => {
  it("matches agent and task review kinds only", () => {
    expect(isLiveRequestReviewKind("agent_create_review")).toBe(true);
    expect(isLiveRequestReviewKind("agent_update_review")).toBe(true);
    expect(isLiveRequestReviewKind("task_create_review")).toBe(true);
    expect(isLiveRequestReviewKind("task_update_review")).toBe(true);
    expect(isLiveRequestReviewKind("agent_management_confirmation")).toBe(false);
    expect(isLiveRequestReviewKind("add_secret")).toBe(false);
  });
});

describe("LiveRequestReviewForm — agent create (compact field form)", () => {
  function createRequest(): LiveRequest {
    return {
      id: "req-create",
      conversationId: "conv-1",
      kind: "agent_create_review",
      presentation: { title: "Review agent", cancelLabel: "Cancel" },
      fields: [
        field("name", "Name", "Helper"),
        field("role", "Role", "Assistant"),
        field("instructions", "Instructions", "Be helpful.", "textarea"),
        field("defaultModel", "Default model", "anthropic/claude-opus-4-8"),
        field("iconPath", "Icon path", ""),
      ],
      actions: reviewActions,
      metadata: {},
      closable: false,
      createdAt: "2026-06-06T10:00:00.000Z",
    };
  }

  it("renders a searchable model field that filters by keyword", async () => {
    renderForm(createRequest());

    expect(await screen.findByDisplayValue("Helper")).toBeInTheDocument();
    const modelInput = screen.getByDisplayValue("Claude Opus 4.8");
    expect(modelInput.tagName).toBe("INPUT");
    expect(screen.queryByText("Skills")).not.toBeInTheDocument();

    fireEvent.focus(modelInput);
    expect(screen.getByRole("option", { name: "Claude Sonnet 4.6" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Claude Opus 4.8" })).toBeInTheDocument();

    fireEvent.change(modelInput, { target: { value: "sonnet" } });
    expect(screen.getByRole("option", { name: "Claude Sonnet 4.6" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Claude Opus 4.8" })).not.toBeInTheDocument();
  });

  it("submits the model picked from the searchable field", async () => {
    const { onResolve } = renderForm(createRequest());

    const modelInput = await screen.findByDisplayValue("Claude Opus 4.8");
    fireEvent.focus(modelInput);
    fireEvent.click(screen.getByRole("option", { name: "Claude Sonnet 4.6" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(onResolve).toHaveBeenCalledWith(
        "req-create",
        "submit",
        expect.objectContaining({
          name: "Helper",
          defaultModel: "anthropic/claude-sonnet-4-6",
        }),
      );
    });
  });
});

describe("LiveRequestReviewForm — agent update (compact field form)", () => {
  function updateRequest(): LiveRequest {
    return {
      id: "req-update",
      conversationId: "conv-1",
      kind: "agent_update_review",
      presentation: { title: "Review agent update", cancelLabel: "Cancel" },
      fields: [field("role", "Role", "research analyst")],
      actions: reviewActions,
      metadata: { agentId: "agent-1", agentName: "research agent", agentIconPath: "emoji:🔬" },
      closable: false,
      createdAt: "2026-06-06T10:00:00.000Z",
    };
  }

  it("shows the agent identity header and only the changed field", async () => {
    renderForm(updateRequest());

    expect(await screen.findByText("research agent")).toBeInTheDocument();
    expect(screen.getByDisplayValue("research analyst")).toBeInTheDocument();
    // No full-form capability sections in the compact view.
    expect(screen.queryByText("Skills")).not.toBeInTheDocument();
  });

  it("submits only the edited field", async () => {
    const { onResolve } = renderForm(updateRequest());

    const input = await screen.findByDisplayValue("research analyst");
    fireEvent.change(input, { target: { value: "lead research analyst" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(onResolve).toHaveBeenCalledWith("req-update", "submit", {
        role: "lead research analyst",
      });
    });
  });
});

describe("LiveRequestReviewForm — task review", () => {
  it("renders an agent dropdown for task reviews", async () => {
    vi.mocked(useAgentsQuery).mockReturnValue(
      emptyQuery([
        { id: "agent-1", name: "Builder" },
        { id: "agent-2", name: "Reviewer" },
      ]),
    );

    const request: LiveRequest = {
      id: "req-task",
      conversationId: "conv-1",
      kind: "task_create_review",
      presentation: { title: "Review task", cancelLabel: "Cancel" },
      fields: [
        field("title", "Title", "Ship it"),
        field("agentId", "Specialist ID", "agent-2"),
        field("scheduledAt", "Scheduled at", ""),
      ],
      actions: reviewActions,
      metadata: {},
      closable: false,
      createdAt: "2026-06-06T10:00:00.000Z",
    };

    renderForm(request);

    const agentSelect = await screen.findByDisplayValue("Reviewer");
    expect(agentSelect.tagName).toBe("SELECT");
    expect(screen.getByRole("option", { name: "Builder" })).toBeInTheDocument();
  });

  it("blocks submit when metadata JSON is invalid", async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined);
    const request: LiveRequest = {
      id: "req-queue",
      conversationId: "conv-1",
      kind: "task_queue_review",
      presentation: { title: "Review queue", cancelLabel: "Cancel" },
      fields: [
        field("taskId", "Task ID", "task-1"),
        field("metadataJson", "Metadata JSON", "{not json", "textarea"),
      ],
      actions: reviewActions,
      metadata: {},
      closable: false,
      createdAt: "2026-06-06T10:00:00.000Z",
    };

    renderForm(request, onResolve);
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(
      await screen.findByText("Metadata JSON must be a valid JSON object."),
    ).toBeInTheDocument();
    expect(onResolve).not.toHaveBeenCalled();
  });
});
