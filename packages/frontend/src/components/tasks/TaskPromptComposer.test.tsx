import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { TaskPromptComposer } from "./TaskPromptComposer";
import { createTaskPromptValue, type TaskPromptValue } from "./task-prompt";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe("TaskPromptComposer", () => {
  it("does not open skill lookup for slash inside ordinary text", async () => {
    const user = userEvent.setup();

    renderComposer();

    await user.type(screen.getByLabelText("Task prompt"), "src/components");

    expect(screen.queryByRole("button", { name: /\/components/i })).not.toBeInTheDocument();
  });

  it("opens skill lookup for slash after whitespace", async () => {
    const user = userEvent.setup();

    renderComposer();

    await user.type(screen.getByLabelText("Task prompt"), "Use /components");

    expect(await screen.findByRole("button", { name: /\/components/i })).toBeInTheDocument();
  });

  it("adds and removes the delegated agent mention from the prompt", async () => {
    const user = userEvent.setup();

    renderComposer();

    await user.type(screen.getByLabelText("Task prompt"), "Ask @review");
    await user.click(await screen.findByRole("button", { name: "@Reviewer" }));

    expect(screen.getByText("@Reviewer")).toBeInTheDocument();
    expect(screen.getByLabelText("Task prompt")).toHaveValue("Ask ");

    await user.click(screen.getByRole("button", { name: "x" }));

    expect(screen.queryByText("@Reviewer")).not.toBeInTheDocument();
  });

  it("replaces the delegated agent mention when another agent is selected", async () => {
    const user = userEvent.setup();

    renderComposer();

    await user.type(screen.getByLabelText("Task prompt"), "Ask @review");
    await user.click(await screen.findByRole("button", { name: "@Reviewer" }));
    await user.type(screen.getByLabelText("Task prompt"), " then @special");
    await user.click(await screen.findByRole("button", { name: "@Specialist" }));

    expect(screen.queryByText("@Reviewer")).not.toBeInTheDocument();
    expect(screen.getByText("@Specialist")).toBeInTheDocument();
    expect(screen.getByLabelText("Task prompt")).toHaveValue("Ask  then ");
  });
});

function renderComposer() {
  function Harness() {
    const [value, setValue] = useState<TaskPromptValue>(() => createTaskPromptValue());

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
      />
    );
  }

  return render(<Harness />);
}
