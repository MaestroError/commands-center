import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Markdown } from "./Markdown";

describe("Markdown", () => {
  it("renders markdown images with their src attribute", () => {
    render(<Markdown content="![diagram](https://example.com/diagram.png)" />);

    expect(screen.getByRole("img", { name: "diagram" })).toHaveAttribute(
      "src",
      "https://example.com/diagram.png",
    );
  });

  it("preserves data URL markdown images", () => {
    const dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";

    render(<Markdown content={`![inline](${dataUrl})`} />);

    expect(screen.getByRole("img", { name: "inline" })).toHaveAttribute("src", dataUrl);
  });
});
