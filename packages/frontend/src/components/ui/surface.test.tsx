import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Surface } from "./surface";

describe("Surface", () => {
  it("renders the default compatibility surface", () => {
    render(<Surface>Content</Surface>);

    expect(screen.getByText("Content")).toHaveClass("cc-panel");
  });

  it("renders the empty-state variant through a semantic child", () => {
    render(
      <Surface asChild variant="empty">
        <section aria-label="Empty">Content</section>
      </Surface>,
    );

    expect(screen.getByRole("region", { name: "Empty" })).toHaveClass("cc-empty-state");
  });
});
