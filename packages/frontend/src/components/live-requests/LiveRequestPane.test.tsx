import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LiveRequestPane } from "./LiveRequestPane";

import type { LiveRequest } from "@cc/shared/schemas";

function makeRequest(overrides: Partial<LiveRequest> = {}): LiveRequest {
  return {
    id: "req-1",
    conversationId: "conv-1",
    kind: "custom-tool",
    presentation: {
      title: "Approve request",
      description: "Agent needs input",
      submitLabel: "Submit",
      cancelLabel: "Cancel",
    },
    fields: [
      {
        type: "text",
        name: "projectName",
        label: "Project name",
        required: true,
        placeholder: "Project name",
      },
    ],
    actions: [],
    metadata: {},
    closable: false,
    createdAt: "2026-05-05T10:00:00.000Z",
    ...overrides,
  };
}

describe("LiveRequestPane", () => {
  it("renders fallback submit and cancel actions", () => {
    render(<LiveRequestPane request={makeRequest()} />);

    expect(screen.getByRole("button", { name: "Submit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("requires required fields before resolving", async () => {
    const onResolve = vi.fn();

    render(<LiveRequestPane onResolve={onResolve} request={makeRequest()} />);

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByText("Project name is required.")).toBeInTheDocument();
    expect(onResolve).not.toHaveBeenCalled();
  });

  it("submits entered values to the resolve handler", async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined);

    render(<LiveRequestPane onResolve={onResolve} request={makeRequest()} />);

    fireEvent.change(screen.getByPlaceholderText("Project name"), {
      target: { value: "Commands Center" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(onResolve).toHaveBeenCalledWith("req-1", "submit", {
        projectName: "Commands Center",
      });
    });
  });

  it("applies disabled rules based on slugified values", () => {
    render(
      <LiveRequestPane
        request={makeRequest({
          actions: [
            {
              id: "duplicate",
              label: "Duplicate",
              variant: "secondary",
              kind: "submit",
              disabledWhen: [
                {
                  rule: "field_slug_equals",
                  field: "projectName",
                  value: "existing-project",
                },
              ],
            },
            {
              id: "create",
              label: "Create",
              variant: "primary",
              kind: "submit",
              disabledWhen: [
                {
                  rule: "field_slug_differs",
                  field: "projectName",
                  value: "existing-project",
                },
              ],
            },
          ],
        })}
      />,
    );

    const duplicateButton = screen.getByRole("button", { name: "Duplicate" });
    const createButton = screen.getByRole("button", { name: "Create" });

    expect(duplicateButton).not.toBeDisabled();
    expect(createButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Project name"), {
      target: { value: "Existing Project" },
    });

    expect(duplicateButton).toBeDisabled();
    expect(createButton).not.toBeDisabled();
  });

  it("cancels with the default operator reason", async () => {
    const onCancel = vi.fn().mockResolvedValue(undefined);

    render(<LiveRequestPane onCancel={onCancel} request={makeRequest()} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(onCancel).toHaveBeenCalledWith("req-1", "Cancelled by operator.");
    });
  });

  it("shows a fallback submit error when resolve rejects with a non-error", async () => {
    const onResolve = vi.fn().mockRejectedValue("nope");

    render(<LiveRequestPane onResolve={onResolve} request={makeRequest()} />);

    fireEvent.change(screen.getByPlaceholderText("Project name"), {
      target: { value: "Commands Center" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByText("Failed to submit request.")).toBeInTheDocument();
  });
});
