import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Alert } from "./alert";

describe("Alert", () => {
  it("applies the danger alert contract without forcing a live role", () => {
    render(<Alert>Problem</Alert>);

    expect(screen.getByText("Problem")).toHaveClass("cc-alert");
    expect(screen.getByText("Problem")).not.toHaveAttribute("role");
  });

  it("preserves semantic children", () => {
    render(
      <Alert asChild>
        <section aria-label="Problem">Problem</section>
      </Alert>,
    );

    expect(screen.getByRole("region", { name: "Problem" })).toHaveClass("cc-alert");
  });
});
