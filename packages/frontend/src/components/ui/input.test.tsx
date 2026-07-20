import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Input } from "./input";

describe("Input", () => {
  it("preserves native props, classes, and refs", () => {
    const ref = createRef<HTMLInputElement>();
    render(
      <Input
        ref={ref}
        aria-label="Name"
        className="font-mono"
        disabled
        name="name"
        required
      />,
    );

    const input = screen.getByLabelText("Name");
    expect(input).toHaveClass("cc-input", "font-mono");
    expect(input).toBeDisabled();
    expect(input).toBeRequired();
    expect(input).toHaveAttribute("name", "name");
    expect(ref.current).toBe(input);
  });
});
