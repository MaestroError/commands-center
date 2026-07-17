import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageHeader } from "./PageHeader";

describe("PageHeader", () => {
  it("renders its title, description, eyebrow, and actions", () => {
    render(
      <PageHeader
        actions={<button type="button">Create</button>}
        description="Manage records."
        eyebrow="Workspace"
        title="Records"
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Records" })).toBeInTheDocument();
    expect(screen.getByText("Manage records.")).toBeInTheDocument();
    expect(screen.getByText("Workspace")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });

  it("preserves the semantic section surface", () => {
    render(<PageHeader description="Manage records." title="Records" />);

    expect(screen.getByRole("heading", { name: "Records" }).closest("section")).toHaveClass(
      "cc-panel",
    );
  });
});
