import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { TaskPromptComposer } from "./TaskPromptComposer";
import { createTaskPromptValue, type TaskPromptValue } from "./task-prompt";
import * as api from "../../lib/api";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function renderComposer(overrides?: {
  initial?: Partial<TaskPromptValue>;
  props?: Partial<React.ComponentProps<typeof TaskPromptComposer>>;
}) {
  function Harness() {
    const [value, setValue] = useState<TaskPromptValue>(() => ({
      ...createTaskPromptValue(),
      ...overrides?.initial,
    }));

    return (
      <TaskPromptComposer
        agentId="agent-1"
        agents={[
          { id: "agent-2", name: "Reviewer" },
          { id: "agent-3", name: "Specialist" },
        ]}
        onChange={setValue}
        skills={[{ slug: "components", description: "Work with components" }]}
        value={value}
        {...overrides?.props}
      />
    );
  }

  return render(<Harness />);
}

function makeMentionTransfer(path: string): DataTransfer {
  return {
    getData: (type: string) => (type === "application/x-cc-file-mention" ? path : ""),
  } as unknown as DataTransfer;
}

describe("TaskPromptComposer shortcuts and mentions", () => {
  it("opens the file popover from the # shortcut pill", async () => {
    vi.spyOn(api, "searchAgentWorkspaceFiles").mockResolvedValue(["src/app.ts"]);
    const user = userEvent.setup();
    renderComposer();

    await user.click(screen.getByRole("button", { name: "# files" }));

    expect(await screen.findByText("File mention")).toBeInTheDocument();
  });

  it("opens the specialist popover from the @ shortcut pill and shows options", async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.click(screen.getByRole("button", { name: "@ specialists" }));

    expect(await screen.findByRole("button", { name: "@Reviewer" })).toBeInTheDocument();
  });

  it("selects a skill from the / shortcut pill and clears it via the chip", async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.click(screen.getByRole("button", { name: "/ skills" }));
    await user.click(await screen.findByRole("button", { name: /\/components/i }));

    expect(screen.getByText("/components")).toBeInTheDocument();

    // Remove the skill chip.
    await user.click(screen.getByRole("button", { name: "x" }));
    expect(screen.queryByText("/components")).not.toBeInTheDocument();
  });

  it("adds a mentioned file via drag-and-drop and removes it", async () => {
    const user = userEvent.setup();
    renderComposer();

    const container = screen.getByLabelText("Task prompt").closest(".relative") as HTMLElement;
    fireEvent.drop(container, { dataTransfer: makeMentionTransfer("src/index.ts") });

    expect(await screen.findByText("index.ts")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "x" }));
    expect(screen.queryByText("index.ts")).not.toBeInTheDocument();
  });

  it("ignores drops while disabled", () => {
    renderComposer({ props: { disabled: true } });

    const container = screen.getByLabelText("Task prompt").closest(".relative") as HTMLElement;
    fireEvent.drop(container, { dataTransfer: makeMentionTransfer("src/index.ts") });

    expect(screen.queryByText("index.ts")).not.toBeInTheDocument();
  });

  it("selects a file from the mention popover, stripping the # token", async () => {
    vi.spyOn(api, "searchAgentWorkspaceFiles").mockResolvedValue(["src/app.ts"]);
    const user = userEvent.setup();
    renderComposer();

    await user.type(screen.getByLabelText("Task prompt"), "look #app");
    await user.click(await screen.findByRole("button", { name: /src\/app\.ts/ }));

    expect(await screen.findByText("app.ts")).toBeInTheDocument();
    expect(screen.getByLabelText("Task prompt")).toHaveValue("look ");
  });

  it("mentions a global document with a distinct chip and strips the # token", async () => {
    vi.spyOn(api, "searchAgentWorkspaceFiles").mockResolvedValue([]);
    vi.spyOn(api, "searchGlobalDocuments").mockResolvedValue([
      {
        scope: "global",
        ownerSlug: null,
        ownerSpecialistId: null,
        relativePath: "design/overview.md",
        fullPath: "/workspace/Documents/design/overview.md",
        title: "Architecture Overview",
        description: null,
        author: null,
      },
    ]);
    const user = userEvent.setup();
    renderComposer();

    await user.type(screen.getByLabelText("Task prompt"), "read #overview");
    await user.click(await screen.findByRole("button", { name: /Architecture Overview/ }));

    expect(await screen.findByText("Global Document:")).toBeInTheDocument();
    expect(screen.getByText("Architecture Overview")).toBeInTheDocument();
    expect(screen.getByLabelText("Task prompt")).toHaveValue("read ");
  });

  it("navigates the specialist popover with the keyboard and selects with Enter", async () => {
    const user = userEvent.setup();
    renderComposer();

    const textarea = screen.getByLabelText("Task prompt");
    await user.type(textarea, "@");
    await screen.findByRole("button", { name: "@Reviewer" });

    // ArrowDown highlights Specialist, then Enter selects it.
    fireEvent.keyDown(textarea, { key: "ArrowDown" });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByTestId("task-specialist-mention-chip-agent-3")).toBeInTheDocument();
    });
  });

  it("closes an open popover with Escape", async () => {
    const user = userEvent.setup();
    renderComposer();

    const textarea = screen.getByLabelText("Task prompt");
    await user.type(textarea, "@");
    await screen.findByRole("button", { name: "@Reviewer" });

    fireEvent.keyDown(textarea, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "@Reviewer" })).not.toBeInTheDocument();
    });
  });
});
