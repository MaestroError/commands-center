import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusBadge } from "./task-ui";

describe("StatusBadge", () => {
  it("uses the danger tone for failed statuses", () => {
    const { rerender } = render(<StatusBadge status="failed" />);
    expect(screen.getByText("Failed")).toHaveClass("text-danger");

    rerender(<StatusBadge status="cancelled" />);
    expect(screen.getByText("Cancelled")).toHaveClass("text-danger");
  });

  it("uses the in-progress tone for active statuses", () => {
    const { rerender } = render(<StatusBadge status="running" />);
    expect(screen.getByText("Running")).toHaveClass("text-amber-300");

    rerender(<StatusBadge status="in_progress" />);
    expect(screen.getByText("In Progress")).toHaveClass("text-amber-300");
  });

  it("uses the queued tone for queued statuses", () => {
    render(<StatusBadge status="queued" />);

    expect(screen.getByText("Queued")).toHaveClass("text-accent");
  });

  it("uses the accent tone for completed-style statuses", () => {
    render(<StatusBadge status="completed" />);

    expect(screen.getByText("Completed")).toHaveClass("text-accent");
  });
});
