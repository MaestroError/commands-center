import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ChatComposer } from "./ChatComposer";
import * as api from "../../lib/api";

const mockUseMediaQuery = vi.fn((_query: string) => false);
vi.mock("../../hooks/use-media-query", () => ({
  useMediaQuery: (query: string) => mockUseMediaQuery(query),
}));

vi.mock("../../hooks/use-providers-query", () => ({
  useProvidersQuery: () => ({ data: [], isLoading: false }),
}));

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();

  // jsdom does not implement DataTransfer, which ChatComposer builds when
  // handling pasted files. Provide a minimal stand-in supporting items.add + files.
  if (typeof globalThis.DataTransfer === "undefined") {
    class FakeDataTransfer {
      private readonly _files: File[] = [];
      items = {
        add: (file: File) => {
          this._files.push(file);
        },
      };
      get files(): File[] {
        return this._files;
      }
    }
    // @ts-expect-error assigning a test polyfill
    globalThis.DataTransfer = FakeDataTransfer;
  }
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

const messagePlaceholder = 'Type a message... Use "#" to mention';

function makeDataTransfer(files: File[], mention = ""): DataTransfer {
  return {
    files,
    getData: (type: string) => (type === "application/x-cc-file-mention" ? mention : ""),
  } as unknown as DataTransfer;
}

describe("ChatComposer attachments", () => {
  it("attaches a dropped file and can remove it before sending", async () => {
    const user = userEvent.setup();
    renderComposer();

    const composer = screen
      .getByPlaceholderText(messagePlaceholder)
      .closest(".relative") as HTMLElement;
    const file = new File(["hello"], "notes.txt", { type: "text/plain" });

    fireEvent.drop(composer, { dataTransfer: makeDataTransfer([file]) });

    expect(await screen.findByText("notes.txt")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove attachment" }));
    expect(screen.queryByText("notes.txt")).not.toBeInTheDocument();
  });

  it("attaches an image chosen from the file input and includes it in onSend", async () => {
    const user = userEvent.setup();
    const { props } = renderComposer();

    await user.click(screen.getByTitle("Attach files"));

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const image = new File(["binary"], "shot.png", { type: "image/png" });
    await user.upload(input, image);

    expect(await screen.findByText("shot.png")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(messagePlaceholder), "look");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(props.onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "look",
        attachments: [expect.objectContaining({ type: "image", filename: "shot.png" })],
      }),
    );
  });

  it("normalizes an attached Markdown file to text/plain before sending", async () => {
    const user = userEvent.setup();
    const { props } = renderComposer();

    await user.click(screen.getByTitle("Attach files"));

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const markdown = new File(["# Notes"], "notes.md", { type: "text/markdown" });
    await user.upload(input, markdown);

    expect(await screen.findByText("notes.md")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(messagePlaceholder), "review");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(props.onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [expect.objectContaining({ filename: "notes.md", mimeType: "text/plain" })],
      }),
    );
  });

  it("attaches files pasted into the composer", async () => {
    renderComposer();
    const textarea = screen.getByPlaceholderText(messagePlaceholder);
    const file = new File(["x"], "pasted.txt", { type: "text/plain" });

    fireEvent.paste(textarea, {
      clipboardData: {
        items: [{ kind: "file", getAsFile: () => file }],
      },
    });

    expect(await screen.findByText("pasted.txt")).toBeInTheDocument();
  });

  it("ignores pastes that contain no files", () => {
    renderComposer();
    const textarea = screen.getByPlaceholderText(messagePlaceholder);

    fireEvent.paste(textarea, {
      clipboardData: { items: [{ kind: "string", getAsFile: () => null }] },
    });

    expect(screen.queryByRole("button", { name: "Remove attachment" })).not.toBeInTheDocument();
  });
});

describe("ChatComposer history navigation", () => {
  it("recalls the previous prompt with ArrowUp after sending", async () => {
    const user = userEvent.setup();
    renderComposer();
    const textarea = screen.getByPlaceholderText(messagePlaceholder);

    await user.type(textarea, "remembered{enter}");
    expect(textarea).toHaveValue("");

    textarea.focus();
    await user.keyboard("{ArrowUp}");

    await waitFor(() => expect(textarea).toHaveValue("remembered"));

    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(textarea).toHaveValue(""));
  });
});

describe("ChatComposer escape handling", () => {
  it("aborts a busy agent when Escape is pressed with no popover open", async () => {
    const user = userEvent.setup();
    const { props } = renderComposer({ agentStatus: "busy" });

    const textarea = screen.getByPlaceholderText(messagePlaceholder);
    textarea.focus();
    await user.keyboard("{Escape}");

    expect(props.onAbort).toHaveBeenCalled();
  });
});

describe("ChatComposer file mentions", () => {
  it("selects a file from the mention popover and can remove the pill", async () => {
    const searchSpy = vi.spyOn(api, "searchAgentWorkspaceFiles").mockResolvedValue(["src/app.ts"]);
    const user = userEvent.setup();
    renderComposer();

    const textarea = screen.getByPlaceholderText(messagePlaceholder);
    await user.type(textarea, "#app");

    const option = await screen.findByRole("button", { name: /src\/app\.ts/ });
    await user.click(option);

    expect(searchSpy).toHaveBeenCalled();
    // The #query is stripped and a mention pill is shown.
    const pill = await screen.findByText("app.ts");
    expect(pill).toBeInTheDocument();

    // Removing the pill button clears the mention.
    const removeButton = pill.closest("span")?.querySelector("button") as HTMLButtonElement;
    await user.click(removeButton);
    expect(screen.queryByText("app.ts")).not.toBeInTheDocument();
  });

  it("mentions a global document and sends it as an absolute-path token", async () => {
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
    const { props } = renderComposer();

    const textarea = screen.getByPlaceholderText(messagePlaceholder);
    await user.type(textarea, "#overview");

    await user.click(await screen.findByRole("button", { name: /Architecture Overview/ }));

    // The chip is labelled as a global document showing its relative path.
    expect(await screen.findByText("Global Document:")).toBeInTheDocument();
    expect(screen.getByText("design/overview.md")).toBeInTheDocument();

    await user.type(textarea, "summarize it");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(props.onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "#/workspace/Documents/design/overview.md summarize it",
      }),
    );
  });

  it("sends a skill invocation together with a mentioned file as a normal message", async () => {
    const user = userEvent.setup();
    const { props } = renderComposer();

    // Select the /review skill from the slash popover.
    await user.type(screen.getByPlaceholderText(messagePlaceholder), "/review");
    await user.click(await screen.findByRole("button", { name: /\/review/i }));

    // Drop a workspace file so the skill send takes the "has content" branch.
    const composer = screen
      .getByPlaceholderText("Prompt for /review...")
      .closest(".relative") as HTMLElement;
    fireEvent.drop(composer, { dataTransfer: makeDataTransfer([], "src/index.ts") });

    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(props.onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Use skill "review". #src/index.ts',
      }),
    );
  });
});
