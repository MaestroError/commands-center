import type * as ReactRouterDom from "react-router";
import { MemoryRouter } from "react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Activity } from "@cc/shared/schemas";

import { ActivityActions } from "./ActivityActions";

const { runTemplateNowMutate, navigateSpy } = vi.hoisted(() => ({
  runTemplateNowMutate: vi.fn(),
  navigateSpy: vi.fn(),
}));

vi.mock("@/hooks/use-tasks-query", () => ({
  useTaskMutations: () => ({
    create: { mutate: vi.fn(), isPending: false },
    createTemplate: { mutate: vi.fn(), isPending: false },
    runTemplateNow: { mutate: runTemplateNowMutate, isPending: false },
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

vi.mock("react-router", async (importOriginal) => {
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
  it("opens the task creation page prefilled with the proposal", () => {
    renderActions(
      activity({
        id: "act-1",
        kind: "task_proposal",
        title: "Draft report",
        payload: { title: "Draft report", reason: "follow-up", assigneeSlug: "researcher" },
      }),
    );

    fireEvent.click(screen.getByText("Review & create"));

    expect(navigateSpy).toHaveBeenCalledWith(
      "/tasks/new",
      expect.objectContaining({
        state: {
          taskPrefill: expect.objectContaining({ agentId: "agent-2", title: "Draft report" }),
        },
      }),
    );
  });

  it("defaults the assignee to the proposing specialist when none is given", () => {
    renderActions(
      activity({
        id: "act-5",
        kind: "task_proposal",
        title: "Audit pools",
        payload: { title: "Audit pools", reason: "why", proposedBySlug: "writer" },
      }),
    );

    fireEvent.click(screen.getByText("Review & create"));

    expect(navigateSpy).toHaveBeenCalledWith(
      "/tasks/new",
      expect.objectContaining({
        state: { taskPrefill: expect.objectContaining({ agentId: "agent-1" }) },
      }),
    );
  });

  it("opens the template creation page prefilled with the proposal", () => {
    renderActions(
      activity({
        id: "act-4",
        kind: "task_template_proposal",
        title: "Weekly digest",
        payload: { title: "Weekly digest", reason: "recurring summary", assigneeSlug: "writer" },
      }),
    );

    fireEvent.click(screen.getByText("Review & create"));

    expect(navigateSpy).toHaveBeenCalledWith(
      "/tasks/templates/new",
      expect.objectContaining({
        state: {
          templatePrefill: expect.objectContaining({
            defaultAgentId: "agent-1",
            title: "Weekly digest",
          }),
        },
      }),
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
    expect(runTemplateNowMutate).toHaveBeenCalledWith({ id: "tmpl-1" }, expect.anything());
  });

  it("opens the terminal carrying the command for a run-command proposal", () => {
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

    expect(navigateSpy).toHaveBeenCalledWith("/terminal", {
      state: { runCommand: "npm run build" },
    });
  });
});
