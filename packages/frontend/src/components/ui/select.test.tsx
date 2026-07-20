import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

function SelectHost(props: { disabled?: boolean; name?: string; required?: boolean }) {
  const [value, setValue] = useState("alpha");

  return (
    <Select
      disabled={props.disabled}
      name={props.name}
      required={props.required}
      value={value}
      onValueChange={setValue}
    >
      <SelectTrigger aria-label="Example option">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="alpha">Alpha</SelectItem>
        <SelectItem value="beta">Beta</SelectItem>
      </SelectContent>
    </Select>
  );
}

describe("Select", () => {
  it("shows the selected option", () => {
    render(<SelectHost />);

    expect(screen.getByRole("combobox", { name: "Example option" })).toHaveTextContent("Alpha");
  });

  it("selects an option with the keyboard", async () => {
    const user = userEvent.setup();
    render(<SelectHost />);
    const trigger = screen.getByRole("combobox", { name: "Example option" });

    trigger.focus();
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(trigger).toHaveTextContent("Beta");
    expect(trigger).toHaveFocus();
  });

  it("submits the selected value through its form control", () => {
    render(
      <form data-testid="form">
        <SelectHost name="choice" required />
      </form>,
    );

    const form = screen.getByTestId("form");
    expect(form).toBeInstanceOf(HTMLFormElement);
    if (!(form instanceof HTMLFormElement)) return;

    expect(new FormData(form).get("choice")).toBe("alpha");
  });

  it("disables the trigger", () => {
    render(<SelectHost disabled />);

    expect(screen.getByRole("combobox", { name: "Example option" })).toBeDisabled();
  });
});
