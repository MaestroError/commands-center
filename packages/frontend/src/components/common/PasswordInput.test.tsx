import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { PasswordInput } from "@/components/common/PasswordInput";

describe("PasswordInput", () => {
  it("toggles password visibility", async () => {
    const user = userEvent.setup();
    render(<PasswordInput aria-label="Owner password" defaultValue="secret-value" />);

    expect(screen.getByLabelText("Owner password")).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Show password" }));

    expect(screen.getByLabelText("Owner password")).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: "Hide password" }));

    expect(screen.getByLabelText("Owner password")).toHaveAttribute("type", "password");
  });

  it("preserves the value while toggling visibility", async () => {
    const user = userEvent.setup();
    render(<PasswordInput aria-label="Owner password" defaultValue="secret-value" />);

    await user.click(screen.getByRole("button", { name: "Show password" }));

    expect(screen.getByLabelText("Owner password")).toHaveValue("secret-value");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("passes native props, caller classes, and refs to the input", () => {
    const ref = createRef<HTMLInputElement>();
    render(
      <PasswordInput
        ref={ref}
        aria-label="Owner password"
        autoComplete="current-password"
        className="font-mono"
        name="password"
        required
      />,
    );

    const input = screen.getByLabelText("Owner password");
    expect(input).toHaveClass("cc-input", "pr-11", "font-mono");
    expect(input).toHaveAttribute("autocomplete", "current-password");
    expect(input).toHaveAttribute("name", "password");
    expect(input).toBeRequired();
    expect(ref.current).toBe(input);
  });

  it("disables the visibility action with the input", () => {
    render(<PasswordInput aria-label="Owner password" disabled />);

    expect(screen.getByLabelText("Owner password")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Show password" })).toBeDisabled();
  });
});
