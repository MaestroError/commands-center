import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Badge } from "./badge";

describe("Badge", () => {
  it("renders readable status text", () => {
    render(<Badge variant="success">Connected</Badge>);

    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("uses semantic warning roles", () => {
    render(<Badge variant="warning">Needs auth</Badge>);

    expect(screen.getByText("Needs auth")).toHaveClass(
      "border-warning-border",
      "bg-warning-surface",
      "text-warning-foreground",
    );
  });
});
