import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ChatComposer } from "./ChatComposer";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderComposer(overrides: Partial<React.ComponentProps<typeof ChatComposer>> = {}) {
  const props: React.ComponentProps<typeof ChatComposer> = {
    onSend: vi.fn(),
    onShell: vi.fn(),
    onCommand: vi.fn(),
    onSummarize: vi.fn(),
    onAbort: vi.fn(),
    onStartFresh: vi.fn(),
    agentStatus: "idle",
    agentId: "agent-1",
    autoApprove: false,
    onAutoApproveChange: vi.fn(),
    skills: [{ slug: "review", description: "Review code" }],
    disabled: false,
    autoFocusKey: "conv-1",
    ...overrides,
  };

  return { ...render(<ChatComposer {...props} />), props };
}

describe("ChatComposer", () => {
  it("calls onSend with typed text when clicking Send", async () => {
    const user = userEvent.setup();
    const { props } = renderComposer();

    await user.type(
      screen.getByPlaceholderText('Type a message... Use "#" to mention'),
      "hello world",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(props.onSend).toHaveBeenCalledWith({ text: "hello world", attachments: [] });
  });

  it("shows a small hint about composer shortcuts", () => {
    renderComposer();

    expect(screen.getByText("# files")).toBeInTheDocument();
    expect(screen.getByText("/ skills")).toBeInTheDocument();
    expect(screen.getByText("! shell")).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Type a message... Use "#" to mention')).toBeInTheDocument();
  });

  it("hides shortcut pills when the user starts typing", async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.type(screen.getByPlaceholderText('Type a message... Use "#" to mention'), "h");

    expect(screen.queryByRole("button", { name: "# files" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "/ skills" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "! shell" })).not.toBeInTheDocument();
  });

  it("prefills the composer with a file mention when # pill is clicked", async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.click(screen.getByRole("button", { name: "# files" }));
    expect(screen.getByPlaceholderText('Type a message... Use "#" to mention')).toHaveValue("#");
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type a message... Use "#" to mention')).toHaveFocus();
    });
  });

  it("prefills the composer with a slash when / pill is clicked", async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.click(screen.getByRole("button", { name: "/ skills" }));
    expect(screen.getByPlaceholderText('Type a message... Use "#" to mention')).toHaveValue("/");
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type a message... Use "#" to mention')).toHaveFocus();
    });
  });

  it("switches to shell mode when ! pill is clicked", async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.click(screen.getByRole("button", { name: "! shell" }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter shell command...")).toHaveFocus();
    });
  });

  it("disables Send when the textarea is empty and there is no skill selected", () => {
    renderComposer();

    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("shows Stop instead of Send when busy and clicking it calls onAbort", async () => {
    const user = userEvent.setup();
    const { props } = renderComposer({ agentStatus: "busy" });

    expect(screen.queryByRole("button", { name: "Send" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Stop" }));

    expect(props.onAbort).toHaveBeenCalled();
  });

  it("shows Stop instead of Send when retrying and clicking it calls onAbort", async () => {
    const user = userEvent.setup();
    const { props } = renderComposer({ agentStatus: "retry" });

    expect(screen.queryByRole("button", { name: "Send" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Stop" }));

    expect(props.onAbort).toHaveBeenCalled();
  });

  it("switches to shell mode when ! is typed first and Enter calls onShell", async () => {
    const user = userEvent.setup();
    const { props } = renderComposer();
    const textarea = screen.getByPlaceholderText('Type a message... Use "#" to mention');

    await user.type(textarea, "!");
    expect(screen.getByText("Shell")).toBeInTheDocument();

    const shellTextarea = screen.getByPlaceholderText("Enter shell command...");
    await user.type(shellTextarea, "ls{enter}");

    expect(props.onShell).toHaveBeenCalledWith("ls");
  });

  it("focuses the textarea when the active conversation changes", async () => {
    const { rerender, props } = renderComposer({ autoFocusKey: "conv-1" });

    rerender(<ChatComposer {...props} autoFocusKey="conv-2" />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type a message... Use "#" to mention')).toHaveFocus();
    });
  });

  it("exits shell mode when Escape is pressed", async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.type(screen.getByPlaceholderText('Type a message... Use "#" to mention'), "!");
    expect(screen.getByText("Shell")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByText("Shell")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Type a message... Use "#" to mention')).toBeInTheDocument();
  });

  it("selects /compact from the popover and calls onSummarize", async () => {
    const user = userEvent.setup();
    const { props } = renderComposer();

    await user.type(
      screen.getByPlaceholderText('Type a message... Use "#" to mention'),
      "/compact",
    );
    await user.click(await screen.findByRole("button", { name: /\/compact/i }));

    expect(props.onSummarize).toHaveBeenCalled();
  });

  it("selects /new from the popover and calls onStartFresh", async () => {
    const user = userEvent.setup();
    const { props } = renderComposer();

    await user.type(screen.getByPlaceholderText('Type a message... Use "#" to mention'), "/new");
    await user.click(await screen.findByRole("button", { name: /\/new/i }));

    expect(props.onStartFresh).toHaveBeenCalled();
  });

  it("calls onCommand when a skill is selected and there is no text", async () => {
    const user = userEvent.setup();
    const { props } = renderComposer();

    await user.type(screen.getByPlaceholderText('Type a message... Use "#" to mention'), "/review");
    await user.click(await screen.findByRole("button", { name: /\/review/i }));
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(props.onCommand).toHaveBeenCalledWith("review");
  });

  it("calls onSend with the skill prefix when a skill and text are both present", async () => {
    const user = userEvent.setup();
    const { props } = renderComposer();

    await user.type(screen.getByPlaceholderText('Type a message... Use "#" to mention'), "/review");
    await user.click(await screen.findByRole("button", { name: /\/review/i }));
    await user.type(screen.getByPlaceholderText("Prompt for /review..."), "check this file");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(props.onSend).toHaveBeenCalledWith({
      text: 'Use skill "review". check this file',
      attachments: [],
    });
  });

  it("adds a file mention when a workspace file is dropped onto the composer", async () => {
    const user = userEvent.setup();
    const { props } = renderComposer();
    const composer = screen
      .getByPlaceholderText('Type a message... Use "#" to mention')
      .closest(".relative") as HTMLElement;
    const dataTransfer = {
      files: [] as File[],
      getData: (type: string) => (type === "application/x-cc-file-mention" ? "src/index.ts" : ""),
    } as unknown as DataTransfer;

    fireEvent.drop(composer, { dataTransfer });

    expect(screen.getByText("index.ts")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(props.onSend).toHaveBeenCalledWith({ text: "#src/index.ts ", attachments: [] });
  });

  it("ignores dropped node_modules file mentions", () => {
    const { props } = renderComposer();
    const composer = screen
      .getByPlaceholderText('Type a message... Use "#" to mention')
      .closest(".relative") as HTMLElement;
    const dataTransfer = {
      files: [] as File[],
      getData: (type: string) =>
        type === "application/x-cc-file-mention" ? "node_modules/pkg/index.js" : "",
    } as unknown as DataTransfer;

    fireEvent.drop(composer, { dataTransfer });

    expect(screen.queryByText("index.js")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(props.onSend).not.toHaveBeenCalled();
  });
});
