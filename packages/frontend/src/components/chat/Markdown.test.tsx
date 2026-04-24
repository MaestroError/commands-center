import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Markdown } from "./Markdown";

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it("copies inline code when clicked", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<Markdown content="Use `duckduckgo_search` here" />);

    await user.click(screen.getByText("duckduckgo_search"));

    expect(writeText).toHaveBeenCalledWith("duckduckgo_search");
  });
});
