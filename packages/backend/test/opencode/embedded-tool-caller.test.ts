import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { agents } from "../../src/db/schema/agents.js";
import { conversations } from "../../src/db/schema/conversations.js";
import { task_runs, tasks } from "../../src/db/schema/tasks.js";
import { createEmbeddedToolCallerResolver } from "../../src/opencode/embedded-tool-caller.js";
import { createTestDatabase } from "../helpers/db.js";

describe("embedded tool caller ownership", () => {
  let fixture: Awaited<ReturnType<typeof createTestDatabase>>;
  let directory: string;
  let resolve: ReturnType<typeof createEmbeddedToolCallerResolver>;
  let sessions: Map<string, { parentID?: string; location: { directory: string } }>;

  beforeEach(async () => {
    fixture = await createTestDatabase();
    const specialistsDirectory = join(fixture.cwd, "specialists");
    directory = join(specialistsDirectory, "alpha");
    await mkdir(directory, { recursive: true });
    const now = new Date();
    await fixture.client.db.insert(agents).values({
      id: "agent",
      slug: "alpha",
      name: "Alpha",
      role: "Test",
      instructions: "Test",
      default_model: "test/test",
      status: "active",
      capabilities_json: "{}",
      created_at: now,
      updated_at: now,
    });
    await fixture.client.db.insert(conversations).values({
      id: "conversation",
      agent_id: "agent",
      opencode_session_id: "chat",
      status: "active",
      source: "chat",
      is_current: false,
      created_at: now,
      updated_at: now,
    });
    await fixture.client.db.insert(tasks).values({
      id: "task",
      agent_id: "agent",
      title: "Task",
      description: "Test",
      context: "",
      todos_json: "[]",
      status: "running",
      enabled: true,
      archived: false,
      created_at: now,
      updated_at: now,
    });
    await fixture.client.db.insert(task_runs).values({
      id: "run",
      task_id: "task",
      agent_id: "agent",
      opencode_session_id: "task-session",
      status: "running",
      trigger_source: "manual",
      rendered_prompt: "Test",
      created_at: now,
      updated_at: now,
    });
    sessions = new Map([
      ["chat", { location: { directory } }],
      ["task-session", { location: { directory } }],
      ["child", { parentID: "task-session", location: { directory } }],
      ["unknown", { location: { directory } }],
    ]);
    resolve = createEmbeddedToolCallerResolver({
      db: fixture.client.db,
      specialistsDirectory,
      getSession: (id) => {
        const session = sessions.get(id);
        if (!session) throw new Error("Session not found");
        return Promise.resolve(session);
      },
    });
  });

  afterEach(async () => fixture.cleanup());

  it("resolves a restored chat without requiring it to be the current chat", async () => {
    expect(await resolve(directory, "chat")).toMatchObject({
      context: "chat",
      conversationId: "conversation",
      agentId: "agent",
      sessionID: "chat",
    });
  });
  it("resolves the exact task run from its persisted session", async () => {
    expect(await resolve(directory, "task-session")).toMatchObject({
      context: "task_run",
      taskId: "task",
      taskRunId: "run",
    });
  });
  it("resolves a child session through its owning task session", async () => {
    expect(await resolve(directory, "child")).toMatchObject({
      context: "task_run",
      taskRunId: "run",
      sessionID: "child",
      ownerSessionID: "task-session",
    });
  });
  it("rejects an unknown session instead of using the specialist's running task", async () => {
    await expect(resolve(directory, "unknown")).rejects.toThrow("no CC owner");
  });
  it("rejects a caller from another workspace", async () => {
    sessions.set("chat", { location: { directory: fixture.cwd } });
    await expect(resolve(directory, "chat")).rejects.toThrow("another workspace");
  });
  it("rejects ownership attributed to another specialist directory", async () => {
    const otherDirectory = join(fixture.cwd, "other");
    await mkdir(otherDirectory);
    sessions.set("chat", { location: { directory: otherDirectory } });
    await expect(resolve(otherDirectory, "chat")).rejects.toThrow("another specialist");
  });
  it("rejects a child whose parent belongs to another workspace", async () => {
    sessions.set("task-session", { location: { directory: fixture.cwd } });
    await expect(resolve(directory, "child")).rejects.toThrow("another workspace");
  });
  it("rejects an archived specialist", async () => {
    await fixture.client.db
      .update(agents)
      .set({ status: "archived" })
      .where(eq(agents.id, "agent"));
    await expect(resolve(directory, "chat")).rejects.toThrow("not active");
  });
  it("rejects a completed task run", async () => {
    await fixture.client.db
      .update(task_runs)
      .set({ status: "completed" })
      .where(eq(task_runs.id, "run"));
    await expect(resolve(directory, "task-session")).rejects.toThrow("not running");
  });
  it("rejects conflicting chat and task ownership", async () => {
    await fixture.client.db
      .update(task_runs)
      .set({ opencode_session_id: "chat" })
      .where(eq(task_runs.id, "run"));
    await expect(resolve(directory, "chat")).rejects.toThrow("Conflicting");
  });
  it("rejects ambiguous task session ownership", async () => {
    const now = new Date();
    await fixture.client.db.insert(task_runs).values({
      id: "other-run",
      task_id: "task",
      agent_id: "agent",
      opencode_session_id: "task-session",
      status: "completed",
      trigger_source: "manual",
      rendered_prompt: "Test",
      created_at: now,
      updated_at: now,
    });
    await expect(resolve(directory, "task-session")).rejects.toThrow("Ambiguous");
  });
  it("accepts the task's matching conversation projection", async () => {
    await fixture.client.db
      .update(conversations)
      .set({
        opencode_session_id: "task-session",
        source: "task",
        task_id: "task",
        task_run_id: "run",
      })
      .where(eq(conversations.id, "conversation"));
    expect(await resolve(directory, "task-session")).toMatchObject({
      context: "task_run",
      taskRunId: "run",
    });
  });
  it("rejects a task conversation without a matching run", async () => {
    await fixture.client.db
      .update(conversations)
      .set({ source: "task" })
      .where(eq(conversations.id, "conversation"));
    await expect(resolve(directory, "chat")).rejects.toThrow("Conflicting");
  });
  it("rejects cyclic session ancestry", async () => {
    sessions.set("unknown", { parentID: "unknown", location: { directory } });
    await expect(resolve(directory, "unknown")).rejects.toThrow("Cyclic");
  });
});
