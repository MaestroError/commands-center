import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { PermissionDock } from "./PermissionDock";

function makePermission(
  overrides: Partial<React.ComponentProps<typeof PermissionDock>["permission"]> = {},
) {
  return {
    id: "perm-1",
    sessionID: "session-1",
    permission: "workspace.read",
    patterns: ["src/**", "README.md"],
    metadata: {},
    always: [],
    ...overrides,
  };
}

describe("PermissionDock", () => {
  it("renders the permission name", () => {
    render(<PermissionDock permission={makePermission()} onReply={vi.fn()} />);

    expect(screen.getByText("workspace.read")).toBeInTheDocument();
  });

  it("renders the patterns list when patterns are present", () => {
    render(<PermissionDock permission={makePermission()} onReply={vi.fn()} />);

    expect(screen.getByText("Patterns:")).toBeInTheDocument();
    expect(screen.getByText("src/**")).toBeInTheDocument();
    expect(screen.getByText("README.md")).toBeInTheDocument();
  });

  it("hides the patterns list when patterns are empty", () => {
    render(<PermissionDock permission={makePermission({ patterns: [] })} onReply={vi.fn()} />);

    expect(screen.queryByText("Patterns:")).not.toBeInTheDocument();
  });

  it('calls onReply with reject when clicking "Deny"', () => {
    const onReply = vi.fn();
    render(<PermissionDock permission={makePermission()} onReply={onReply} />);

    fireEvent.click(screen.getByRole("button", { name: "Deny" }));

    expect(onReply).toHaveBeenCalledWith("perm-1", "reject");
  });

  it('calls onReply with once when clicking "Allow Once"', () => {
    const onReply = vi.fn();
    render(<PermissionDock permission={makePermission()} onReply={onReply} />);

    fireEvent.click(screen.getByRole("button", { name: "Allow Once" }));

    expect(onReply).toHaveBeenCalledWith("perm-1", "once");
  });

  it('calls onReply with always when clicking "Always Allow"', () => {
    const onReply = vi.fn();
    render(<PermissionDock permission={makePermission()} onReply={onReply} />);

    fireEvent.click(screen.getByRole("button", { name: "Always Allow" }));

    expect(onReply).toHaveBeenCalledWith("perm-1", "always");
  });
});
