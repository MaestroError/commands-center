import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RunTaskContextDialog } from "./RunTaskContextDialog";

describe("RunTaskContextDialog", () => {
  it("submits the entered context without changing its payload", async () => {
    const user = userEvent.setup();
    const onRun = vi.fn();
    render(<RunTaskContextDialog taskTitle="Release review" onCancel={vi.fn()} onRun={onRun} />);

    await user.type(screen.getByLabelText("Run context"), "Check the release notes");
    await user.click(screen.getByRole("button", { name: "Run task" }));

    expect(onRun).toHaveBeenCalledWith({
      context: { text: "Check the release notes", attachments: [] },
      contextAttachmentUploads: [],
    });
  });

  it("calls the existing cancel callback", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<RunTaskContextDialog taskTitle="Release review" onCancel={onCancel} onRun={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("preserves the existing no-Escape dismissal contract", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<RunTaskContextDialog taskTitle="Release review" onCancel={onCancel} onRun={vi.fn()} />);

    await user.keyboard("{Escape}");

    expect(onCancel).not.toHaveBeenCalled();
  });

  it("preserves the existing no-outside-dismissal contract", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<RunTaskContextDialog taskTitle="Release review" onCancel={onCancel} onRun={vi.fn()} />);

    const overlay = document.querySelector<HTMLElement>('[data-slot="dialog-overlay"]');
    expect(overlay).not.toBeNull();
    await user.click(overlay!);

    expect(onCancel).not.toHaveBeenCalled();
  });
});
