import type * as ReactRouterDom from "react-router-dom";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Activity } from "@cc/shared/schemas";

import { ActivityActions } from "./ActivityActions";

const { createMutate, createTemplateMutate, createFromTemplateMutate, navigateSpy, setPendingSpy } =
  vi.hoisted(() => ({
    createMutate: vi.fn(),
    createTemplateMutate: vi.fn(),
    createFromTemplateMutate: vi.fn(),
    navigateSpy: vi.fn(),
    setPendingSpy: vi.fn(),
  }));

vi.mock("@/hooks/use-tasks-query", () => ({
  useTaskMutations: () => ({
    create: { mutate: createMutate, isPending: false },
    createTemplate: { mutate: createTemplateMutate, isPending: false },
    createFromTemplate: { mutate: createFromTemplateMutate, isPending: false },
  }),
}));

vi.mock("@/hooks/use-specialists-query", () => ({
  useSpecialistsQuery: () => ({
    data: [
      { id: "agent-1", slug: "writer", name: "Writer" },
      { id: "agent-2", slug: "researcher", name: "Researcher" },
    ],
  }),
}));

vi.mock("@/lib/terminal-prefill", () => ({
  setPendingTerminalCommand: setPendingSpy,
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterDom>();
  return { ...actual, useNavigate: () => navigateSpy };
});

function activity(overrides: Partial<Activity> & { id: string; kind: Activity["kind"] }): Activity {
  return {
    level: "action_required",
    status: "pending",
    title: "Activity",
    body: null,
    payload: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archivedAt: null,
    ...overrides,
  };
}

function renderActions(item: Activity, onArchive = vi.fn()) {
  render(
    <MemoryRouter>
      <ActivityActions activity={item} onArchive={onArchive} />
    </MemoryRouter>,
  );
  return onArchive;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("proposal activity actions", () => {
  it("creates a task from a proposal with the proposed assignee preselected", () => {
    renderActions(
      activity({
        id: "act-1",
        kind: "task_proposal",
        title: "Draft report",
        payload: { title: "Draft report", reason: "follow-up", assigneeSlug: "researcher" },
      }),
    );

    fireEvent.click(screen.getByText("Review & create"));
    fireEvent.click(screen.getByText("Create task"));

    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "agent-2",
        title: "Draft report",
        description: "follow-up",
      }),
      expect.anything(),
    );
  });

  it("runs a template from a run-template proposal", () => {
    renderActions(
      activity({
        id: "act-2",
        kind: "run_template_proposal",
        title: "Run template: Digest",
        payload: { templateId: "tmpl-1", templateTitle: "Digest", reason: "time to run" },
      }),
    );

    fireEvent.click(screen.getByText("Run template"));
    expect(createFromTemplateMutate).toHaveBeenCalledWith("tmpl-1", expect.anything());
  });

  it("prefills the terminal and navigates for a run-command proposal", () => {
    renderActions(
      activity({
        id: "act-3",
        kind: "run_command_proposal",
        title: "Run terminal command",
        payload: { command: "npm run build", reason: "verify" },
      }),
    );

    fireEvent.click(screen.getByText("Run command"));
    fireEvent.click(screen.getByText("Open terminal"));

    expect(setPendingSpy).toHaveBeenCalledWith("npm run build");
    expect(navigateSpy).toHaveBeenCalledWith("/terminal");
  });
});
