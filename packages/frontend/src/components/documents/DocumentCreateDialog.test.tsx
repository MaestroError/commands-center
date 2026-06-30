import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  createDocument: vi.fn(),
}));

import { DocumentCreateDialog } from "./DocumentCreateDialog";
import { createDocument } from "@/lib/api";

function renderDialog(props: { defaultFolder?: string; onClose?: () => void } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DocumentCreateDialog
        defaultFolder={props.defaultFolder}
        onClose={props.onClose ?? vi.fn()}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// The "Path" <label> wraps both the input and a trailing helper <span>, so its
// accessible name is the full label text rather than just "Path" — query by
// position instead (Title, Path, Description, in that DOM order).
function getPathInput(): HTMLElement {
  return screen.getAllByRole("textbox")[1]!;
}

// useMutation invokes mutationFn with a second (context) argument, so assert
// against the first call's first argument directly rather than
// toHaveBeenCalledWith, which requires an exact argument-list match.
function lastCreateDocumentInput() {
  return vi.mocked(createDocument).mock.calls.at(-1)?.[0];
}

describe("DocumentCreateDialog", () => {
  it("derives a path from the title", async () => {
    vi.mocked(createDocument).mockResolvedValue({ documents: [] });
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText("Title"), "Architecture Overview");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(lastCreateDocumentInput()).toMatchObject({ path: "architecture-overview.md" });
  });

  it("keeps Create disabled when the title has no alphanumeric characters and no path is set", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText("Title"), "!!!");

    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });

  it("does not submit a hidden-segment path derived from a punctuation-only title", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText("Title"), "!!!");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(createDocument).not.toHaveBeenCalled();
  });

  it("still allows creating with an explicit path when the title is punctuation-only", async () => {
    vi.mocked(createDocument).mockResolvedValue({ documents: [] });
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText("Title"), "!!!");
    await user.type(getPathInput(), "notes.md");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(lastCreateDocumentInput()).toMatchObject({ path: "notes.md" });
  });

  it("prefills the path with the default folder and appends the title slug", async () => {
    vi.mocked(createDocument).mockResolvedValue({ documents: [] });
    const user = userEvent.setup();
    renderDialog({ defaultFolder: "design" });

    expect(getPathInput()).toHaveValue("design/");

    await user.type(screen.getByLabelText("Title"), "Overview");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(lastCreateDocumentInput()).toMatchObject({ path: "design/overview.md" });
  });
});
