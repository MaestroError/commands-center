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
});
