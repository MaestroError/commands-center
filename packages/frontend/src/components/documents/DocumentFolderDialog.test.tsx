import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  createDocumentFolder: vi.fn(),
}));

import { DocumentFolderDialog } from "./DocumentFolderDialog";
import { createDocumentFolder } from "@/lib/api";

function renderDialog(props: { defaultParent?: string; onClose?: () => void } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DocumentFolderDialog
        defaultParent={props.defaultParent}
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

// useMutation invokes mutationFn with a second (context) argument, so assert
// against the first call's first argument directly rather than
// toHaveBeenCalledWith, which requires an exact argument-list match.
function lastCreateFolderInput() {
  return vi.mocked(createDocumentFolder).mock.calls.at(-1)?.[0];
}

describe("DocumentFolderDialog", () => {
  it("closes through Escape", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderDialog({ onClose });

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("exposes an accessible dialog name and description", () => {
    renderDialog();

    expect(screen.getByRole("dialog", { name: "New Folder" })).toHaveAccessibleDescription(
      "Create a folder inside the Documents directory.",
    );
  });

  it("creates a folder at the typed path", async () => {
    vi.mocked(createDocumentFolder).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByRole("textbox"), "design/specs");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(lastCreateFolderInput()).toEqual({ path: "design/specs" });
  });

  it("keeps Create disabled for an empty path", () => {
    renderDialog();

    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });

  it("keeps Create disabled when the prefilled default-parent value still ends with a trailing slash", () => {
    renderDialog({ defaultParent: "design" });

    expect(screen.getByRole("textbox")).toHaveValue("design/");
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });

  it("enables Create and strips the trailing slash once a folder name is appended", async () => {
    vi.mocked(createDocumentFolder).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderDialog({ defaultParent: "design" });

    await user.type(screen.getByRole("textbox"), "specs");
    expect(screen.getByRole("button", { name: "Create" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(lastCreateFolderInput()).toEqual({ path: "design/specs" });
  });

  it("keeps Create disabled when the user types a path with a trailing slash", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByRole("textbox"), "design/specs/");

    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
    expect(createDocumentFolder).not.toHaveBeenCalled();
  });

  it("preserves private scope and owner in the mutation payload", async () => {
    vi.mocked(createDocumentFolder).mockResolvedValue(undefined);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <DocumentFolderDialog onClose={vi.fn()} ownerSlug="planner" scope="private" />
      </QueryClientProvider>,
    );

    await user.type(screen.getByRole("textbox"), "design/specs");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(lastCreateFolderInput()).toEqual({
      scope: "private",
      ownerSlug: "planner",
      path: "design/specs",
    });
  });
});
