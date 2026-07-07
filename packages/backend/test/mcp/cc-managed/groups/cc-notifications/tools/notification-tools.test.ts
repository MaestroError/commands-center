import { describe, expect, it, vi } from "vitest";

import type { AppDb } from "@/db/client.js";
import type { ActivityService } from "@/services/activity-service.js";
import { createNotificationToolDefinitions } from "@/mcp/cc-managed/groups/cc-notifications/tools/notification-tools.js";

type EmitArgs = Parameters<ActivityService["emit"]>[0];

function setup(overrides?: {
  agent?: { slug: string; status: string } | undefined;
  template?: { id: string; title: string } | undefined;
}) {
  const emit = vi.fn((input: EmitArgs) => ({
    id: "act_1",
    kind: input.kind,
    level: input.level,
    status: "pending" as const,
    title: input.title,
    body: input.body ?? null,
    payload: input.payload ?? {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archivedAt: null,
  }));

  const db = {
    query: {
      agents: {
        findFirst: vi.fn(() => overrides?.agent),
      },
      task_templates: {
        findFirst: vi.fn(() => overrides?.template),
      },
    },
  } as unknown as AppDb;

  const tools = createNotificationToolDefinitions({
    db,
    activityService: { emit } as unknown as ActivityService,
  });
  const byName = (name: string) => tools.find((tool) => tool.name === name)!;
  return { emit, byName };
}

const context = { agentSlug: "researcher" };

describe("notification tools", () => {
  it("notify_info emits an info-level activity carrying the markdown body", async () => {
    const { emit, byName } = setup();
    const result = await byName("notify_info").execute(
      { title: "Heads up", markdown: "**important** detail" },
      context,
    );

    expect(result.isError).toBeUndefined();
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "specialist_info",
        level: "info",
        title: "Heads up",
        body: "**important** detail",
        payload: expect.objectContaining({ proposedBySlug: "researcher" }),
      }),
    );
  });

  it("notify_warning emits an action_required activity", async () => {
    const { emit, byName } = setup();
    await byName("notify_warning").execute(
      { title: "Path changed", markdown: "git cli failed; used MCP" },
      context,
    );

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "specialist_warning", level: "action_required" }),
    );
  });

  it("propose_task validates the assignee slug and stamps it into the payload", async () => {
    const { emit, byName } = setup({ agent: { slug: "writer", status: "active" } });
    await byName("propose_task").execute(
      { title: "Write summary", reason: "follow-up needed", assigneeSlug: "writer" },
      context,
    );

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "task_proposal",
        level: "action_required",
        payload: expect.objectContaining({ assigneeSlug: "writer", title: "Write summary" }),
      }),
    );
  });

  it("propose_task errors when the assignee slug does not resolve", async () => {
    const { emit, byName } = setup({ agent: undefined });
    const result = await byName("propose_task").execute(
      { title: "x", reason: "y", assigneeSlug: "ghost" },
      context,
    );

    expect(result.isError).toBe(true);
    expect(emit).not.toHaveBeenCalled();
  });

  it("propose_run_task_template resolves the template title", async () => {
    const { emit, byName } = setup({ template: { id: "tmpl_1", title: "Weekly digest" } });
    await byName("propose_run_task_template").execute(
      { templateId: "tmpl_1", reason: "time to run it" },
      context,
    );

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "run_template_proposal",
        title: "Run template: Weekly digest",
        payload: expect.objectContaining({ templateId: "tmpl_1", templateTitle: "Weekly digest" }),
      }),
    );
  });

  it("propose_run_command emits the command payload", async () => {
    const { emit, byName } = setup();
    await byName("propose_run_command").execute(
      { command: "npm run build", reason: "verify the fix" },
      context,
    );

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "run_command_proposal",
        payload: expect.objectContaining({ command: "npm run build" }),
      }),
    );
  });
});
