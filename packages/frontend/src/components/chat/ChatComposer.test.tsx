import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ChatComposer } from "./ChatComposer";

// Default to a non-touch (desktop) environment so Enter submits. Individual
// tests override this to exercise the touch behavior.
const mockUseMediaQuery = vi.fn((_query: string) => false);
vi.mock("../../hooks/use-media-query", () => ({
  useMediaQuery: (query: string) => mockUseMediaQuery(query),
}));

vi.mock("../../hooks/use-providers-query", () => ({
  useProvidersQuery: () => ({
    data: [
      {
        provider: { id: "minimax", name: "MiniMax" },
        connected: true,
        models: [{ id: "minimax-m3", name: "MiniMax M3", providerId: "minimax" }],
      },
      {
        provider: { id: "anthropic", name: "Anthropic" },
        connected: true,
        models: [{ id: "claude-opus", name: "Claude Opus", providerId: "anthropic" }],
      },
    ],
    isLoading: false,
  }),
}));

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  mockUseMediaQuery.mockReturnValue(false);
  localStorage.clear();
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

  it("submits with Enter on non-touch devices", async () => {
    const user = userEvent.setup();
    const { props } = renderComposer();

    const textarea = screen.getByPlaceholderText('Type a message... Use "#" to mention');
    await user.type(textarea, "hello{enter}");

    expect(props.onSend).toHaveBeenCalledWith({ text: "hello", attachments: [] });
  });

  it("inserts a newline instead of sending on touch devices when Enter is pressed", async () => {
    mockUseMediaQuery.mockReturnValue(true);
    const user = userEvent.setup();
    const { props } = renderComposer();

    const textarea = screen.getByPlaceholderText('Type a message... Use "#" to mention');
    await user.type(textarea, "first{enter}second");

    expect(props.onSend).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("first\nsecond");

    // The Send button still submits the multi-line message.
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(props.onSend).toHaveBeenCalledWith({ text: "first\nsecond", attachments: [] });
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

  it("preselects the specialist default model and resets to it when the chat changes", async () => {
    const user = userEvent.setup();
    const { rerender, props } = renderComposer({ defaultModel: "minimax/minimax-m3" });

    const trigger = screen.getByRole("button", { name: "Select model" });
    expect(trigger).toHaveTextContent("MiniMax M3");

    await user.click(trigger);
    await user.click(screen.getByRole("option", { name: "Anthropic / Claude Opus" }));
    expect(screen.getByRole("button", { name: "Select model" })).toHaveTextContent("Claude Opus");

    // Switching conversation resets the selection back to the specialist default.
    rerender(<ChatComposer {...props} defaultModel="minimax/minimax-m3" autoFocusKey="conv-2" />);
    expect(screen.getByRole("button", { name: "Select model" })).toHaveTextContent("MiniMax M3");
  });

  it("includes the selected model in the onSend payload", async () => {
    const user = userEvent.setup();
    const { props } = renderComposer({ defaultModel: "minimax/minimax-m3" });

    await user.click(screen.getByRole("button", { name: "Select model" }));
    await user.click(screen.getByRole("option", { name: "Anthropic / Claude Opus" }));

    await user.type(
      screen.getByPlaceholderText('Type a message... Use "#" to mention'),
      "hello world",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(props.onSend).toHaveBeenCalledWith({
      text: "hello world",
      attachments: [],
      model: "anthropic/claude-opus",
    });
  });

  it("persists the model per conversation and restores it on remount", async () => {
    const user = userEvent.setup();
    const { unmount, props } = renderComposer({
      defaultModel: "minimax/minimax-m3",
      autoFocusKey: "conv-1",
    });

    await user.click(screen.getByRole("button", { name: "Select model" }));
    await user.click(screen.getByRole("option", { name: "Anthropic / Claude Opus" }));
    expect(screen.getByRole("button", { name: "Select model" })).toHaveTextContent("Claude Opus");

    // Leaving and returning to the same chat keeps the chosen model.
    unmount();
    render(<ChatComposer {...props} defaultModel="minimax/minimax-m3" autoFocusKey="conv-1" />);
    expect(screen.getByRole("button", { name: "Select model" })).toHaveTextContent("Claude Opus");

    // A different (new) chat falls back to the specialist default.
    render(<ChatComposer {...props} defaultModel="minimax/minimax-m3" autoFocusKey="conv-2" />);
    const triggers = screen.getAllByRole("button", { name: "Select model" });
    expect(triggers[triggers.length - 1]).toHaveTextContent("MiniMax M3");
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
