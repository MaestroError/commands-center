import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Textarea } from "./textarea";

describe("Textarea", () => {
  it("forwards its ref", () => {
    const ref = createRef<HTMLTextAreaElement>();
    render(<Textarea aria-label="Notes" ref={ref} />);

    expect(ref.current).toBe(screen.getByRole("textbox", { name: "Notes" }));
  });

  it("preserves controlled value changes", () => {
    let value = "Initial";
    render(
      <Textarea
        aria-label="Notes"
        value={value}
        onChange={(event) => {
          value = event.target.value;
        }}
      />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Notes" }), {
      target: { value: "Updated" },
    });
    expect(value).toBe("Updated");
  });

  it("submits its native form value", () => {
    render(
      <form data-testid="form">
        <Textarea defaultValue="Portable context" name="context" />
      </form>,
    );
    const form = screen.getByTestId("form");
    expect(form).toBeInstanceOf(HTMLFormElement);
    if (!(form instanceof HTMLFormElement)) return;

    expect(new FormData(form).get("context")).toBe("Portable context");
  });

  it("preserves disabled and readonly states", () => {
    render(<Textarea aria-label="Notes" disabled readOnly />);
    const textarea = screen.getByRole("textbox", { name: "Notes" });

    expect(textarea).toBeDisabled();
    expect(textarea).toHaveAttribute("readonly");
  });
});
