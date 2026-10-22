import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Specialist, TaskPermissionProfile } from "@cc/shared/schemas";
import { specialistCatalogSchema } from "@cc/shared/schemas";
import { TaskToolPermissions } from "./TaskToolPermissions";

const catalog = specialistCatalogSchema.parse({
  builtInSkills: [],
  workspaceSkills: [],
  providerModels: [],
  mcpServers: [],
  customTools: [],
  appMcpServers: [
    {
      name: "cc_test",
      description: "Tools",
      enabledByDefault: false,
      tools: [
        { name: "task", description: "Task tool", context: "task_run" },
        { name: "chat", description: "Chat tool", context: "chat" },
      ],
    },
  ],
});
const specialist: Specialist = {
  id: "agent",
  slug: "agent",
  name: "Agent",
  role: "Test",
  instructions: "Test",
  defaultModel: "test/model",
  workspacePath: "/tmp/agent",
  status: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  capabilities: {
    builtInSkills: [],
    workspaceSkills: [],
    customTools: [],
    mcpServers: [],
    toolPermissions: [],
    appToolPermissions: [],
    appMcpServers: [{ name: "cc_test", enabled: false, action: "deny" }],
  },
};

function Harness(props: {
  initial?: TaskPermissionProfile;
  agent?: Specialist;
  changed: (value: TaskPermissionProfile) => void;
}) {
  const [value, setValue] = useState(props.initial);
  return (
    <TaskToolPermissions
      catalog={catalog}
      specialist={props.agent ?? specialist}
      value={value}
      onChange={(next) => {
        setValue(next);
        props.changed(next);
      }}
    />
  );
}

describe("task CC tool controls", () => {
  it("includes system-managed groups from the complete catalog", () => {
    render(
      <TaskToolPermissions
        specialist={specialist}
        value={{ appToolPermissions: [] }}
        onChange={() => {}}
        catalog={{
          ...catalog,
          appMcpServers: [],
          ccManagedMcpServers: catalog.appMcpServers.map((group) => ({
            ...group,
            systemManaged: true,
          })),
        }}
      />,
    );
    fireEvent.click(screen.getByText("cc_test tools"));
    expect(screen.getByRole("button", { name: "cc_test task Allow" })).toBeInTheDocument();
  });

  it("can grant a tool from a specialist-disabled group", async () => {
    const changed = vi.fn<(value: TaskPermissionProfile) => void>();
    render(<Harness changed={changed} />);
    await userEvent.click(screen.getByRole("switch", { name: "Change available tools" }));
    await userEvent.click(screen.getByText("cc_test tools"));
    await userEvent.click(screen.getByRole("button", { name: "cc_test task Allow" }));
    expect(changed.mock.lastCall?.[0].appToolPermissions).toEqual([
      { pattern: "cc_test_task", action: "allow" },
    ]);
  });
  it("does not offer chat-only tools", () => {
    render(
      <Harness
        initial={{ appToolPermissions: [] }}
        changed={vi.fn<(value: TaskPermissionProfile) => void>()}
      />,
    );
    expect(screen.queryByRole("button", { name: "cc_test chat Allow" })).not.toBeInTheDocument();
  });
  it("initializes inherited ask as allow", async () => {
    const changed = vi.fn<(value: TaskPermissionProfile) => void>();
    render(
      <Harness
        initial={{ customTools: ["keep"] }}
        changed={changed}
        agent={{
          ...specialist,
          capabilities: {
            ...specialist.capabilities,
            appMcpServers: [{ name: "cc_test", enabled: true, action: "ask" }],
          },
        }}
      />,
    );
    await userEvent.click(screen.getByRole("switch", { name: "Change available tools" }));
    expect(changed.mock.lastCall?.[0].appToolPermissions).toEqual([
      { pattern: "cc_test_task", action: "allow" },
    ]);
  });
  it("removes the override without removing unrelated permissions", async () => {
    const changed = vi.fn<(value: TaskPermissionProfile) => void>();
    render(
      <Harness
        initial={{
          appToolPermissions: [],
          customTools: ["keep"],
          toolPermissions: [{ pattern: "third_party", action: "ask" }],
        }}
        changed={changed}
      />,
    );
    await userEvent.click(screen.getByRole("switch", { name: "Change available tools" }));
    expect(JSON.parse(JSON.stringify(changed.mock.lastCall?.[0]))).toEqual({
      customTools: ["keep"],
      toolPermissions: [{ pattern: "third_party", action: "ask" }],
    });
  });
  it("shows unlisted tools as denied when reopening an explicit matrix", () => {
    render(
      <Harness
        initial={{ appToolPermissions: [] }}
        changed={vi.fn<(value: TaskPermissionProfile) => void>()}
      />,
    );
    fireEvent.click(screen.getByText("cc_test tools"));
    expect(screen.getByRole("button", { name: "cc_test task Deny" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
