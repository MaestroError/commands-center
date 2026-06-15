import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ConversationPart } from "@cc/shared/schemas";
import { BashTool } from "./BashTool";
import { TaskTool } from "./TaskTool";
import { QuestionTool } from "./QuestionTool";
import { ToolErrorCard } from "./ToolErrorCard";
import { ContextGroup } from "./ContextGroup";
import { BasicTool } from "./BasicTool";

function makePart(overrides: Record<string, unknown>): ConversationPart {
  return { id: "test-1", type: "tool", ...overrides } as ConversationPart;
}

describe("BasicTool", () => {
  it("renders title and subtitle", () => {
    render(<BasicTool title="Shell" subtitle="ls -la" status="completed" />);
    expect(screen.getByText("Shell")).toBeInTheDocument();
    expect(screen.getByText("ls -la")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("expands on click when children are provided", async () => {
    const user = userEvent.setup();
    render(
      <BasicTool title="Test" status="completed">
        <div>Details here</div>
      </BasicTool>,
    );
    expect(screen.queryByText("Details here")).not.toBeInTheDocument();
    await user.click(screen.getByText("Test"));
    expect(screen.getByText("Details here")).toBeInTheDocument();
  });

  it("does not expand when hideDetails is true", async () => {
    const user = userEvent.setup();
    render(
      <BasicTool title="Test" hideDetails>
        <div>Hidden details</div>
      </BasicTool>,
    );
    await user.click(screen.getByText("Test"));
    expect(screen.queryByText("Hidden details")).not.toBeInTheDocument();
  });
});

describe("BashTool", () => {
  it("shows command and output", () => {
    const part = makePart({
      tool: "bash",
      state: {
        status: "completed",
        input: { command: "echo hello" },
        output: "hello",
      },
    });
    render(<BashTool part={part} />);
    // "Shell" appears twice: the collapsed tab name and the expanded body header.
    expect(screen.getAllByText("Shell")).toHaveLength(2);
    expect(screen.getByText("$ echo hello")).toBeInTheDocument();
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("shows animated dots when running", () => {
    const part = makePart({
      tool: "bash",
      state: { status: "running", input: { command: "sleep 5" } },
    });
    render(<BashTool part={part} />);
    expect(screen.getByText("$ sleep 5")).toBeInTheDocument();
    // "Running" appears twice: the collapsed tab (sr-only) and the expanded body header.
    expect(screen.getAllByText("Running")).toHaveLength(2);
  });
});

describe("TaskTool", () => {
  it("renders subagent type and description", () => {
    const part = makePart({
      tool: "agent",
      state: {
        status: "completed",
        input: { subagent_type: "explore", description: "Find API routes" },
      },
    });
    render(<TaskTool part={part} />);
    expect(screen.getByText("Explore")).toBeInTheDocument();
    expect(screen.getByText("Find API routes")).toBeInTheDocument();
  });

  it("capitalizes subagent type", () => {
    const part = makePart({
      tool: "agent",
      state: { status: "running", input: { subagent_type: "general-purpose" } },
    });
    render(<TaskTool part={part} />);
    expect(screen.getByText("General-purpose")).toBeInTheDocument();
  });
});

describe("QuestionTool", () => {
  it("returns null when pending", () => {
    const part = makePart({
      tool: "question",
      state: { status: "pending", input: { questions: [] } },
    });
    const { container } = render(<QuestionTool part={part} />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null when running", () => {
    const part = makePart({
      tool: "question",
      state: { status: "running", input: { questions: [] } },
    });
    const { container } = render(<QuestionTool part={part} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders question and answer when completed", () => {
    const part = makePart({
      tool: "question",
      state: {
        status: "completed",
        input: { questions: [{ question: "Which framework?" }] },
        metadata: { answers: [["React"]] },
      },
    });
    render(<QuestionTool part={part} />);
    expect(screen.getByText("Which framework?")).toBeInTheDocument();
    expect(screen.getByText("React")).toBeInTheDocument();
  });

  it("shows 'No answer' when answer is missing", () => {
    const part = makePart({
      tool: "question",
      state: {
        status: "completed",
        input: { questions: [{ question: "Pick one?" }] },
        metadata: { answers: [] },
      },
    });
    render(<QuestionTool part={part} />);
    expect(screen.getByText("No answer")).toBeInTheDocument();
  });
});

describe("ToolErrorCard", () => {
  it("renders tool name and Error label", () => {
    const part = makePart({
      tool: "bash",
      state: { status: "error", error: "Command failed" },
    });
    render(<ToolErrorCard part={part} />);
    expect(screen.getByText("bash")).toBeInTheDocument();
    expect(screen.getByText("Error")).toBeInTheDocument();
  });

  it("shows error details on expand", async () => {
    const user = userEvent.setup();
    const part = makePart({
      tool: "bash",
      state: { status: "error", error: "Permission denied" },
    });
    render(<ToolErrorCard part={part} />);
    expect(screen.queryByText("Permission denied")).not.toBeInTheDocument();
    await user.click(screen.getByText("bash"));
    expect(screen.getByText("Permission denied")).toBeInTheDocument();
  });
});

describe("ContextGroup", () => {
  const parts = [
    makePart({
      id: "1",
      tool: "read",
      state: { status: "completed", input: { path: "src/index.ts" } },
    }),
    makePart({
      id: "2",
      tool: "glob",
      state: { status: "completed", input: { pattern: "**/*.ts" } },
    }),
    makePart({
      id: "3",
      tool: "grep",
      state: { status: "completed", input: { pattern: "import" } },
    }),
  ];

  it("shows summary with counts", () => {
    render(<ContextGroup parts={parts} />);
    expect(screen.getByText("Gathered context")).toBeInTheDocument();
    expect(screen.getByText("1 read, 2 searches")).toBeInTheDocument();
  });

  it("shows 'Gathering context' when not all completed", () => {
    const mixed = [
      makePart({ id: "1", tool: "read", state: { status: "completed", input: { path: "f.ts" } } }),
      makePart({ id: "2", tool: "glob", state: { status: "running", input: { pattern: "*" } } }),
    ];
    render(<ContextGroup parts={mixed} />);
    expect(screen.getByText("Gathering context")).toBeInTheDocument();
  });

  it("expands to show individual parts", async () => {
    const user = userEvent.setup();
    render(<ContextGroup parts={parts} />);
    await user.click(screen.getByText("Gathered context"));
    expect(screen.getByText("src/index.ts")).toBeInTheDocument();
    expect(screen.getByText("**/*.ts")).toBeInTheDocument();
    expect(screen.getByText("import")).toBeInTheDocument();
  });
});
