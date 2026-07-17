import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Switch } from "./Switch";

describe("common Switch", () => {
  it("preserves the controlled checked and onChange API", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<Switch checked={false} label="Enabled" onChange={onChange} />);

    const control = screen.getByRole("switch", { name: "Enabled" });
    await user.click(control);
    expect(onChange).toHaveBeenCalledWith(true);

    rerender(<Switch checked label="Enabled" onChange={onChange} />);
    expect(control).toBeChecked();
  });

  it("activates once for each Space and Enter keyboard action", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Switch checked={false} aria-label="Enabled" onChange={onChange} />);

    const control = screen.getByRole("switch", { name: "Enabled" });
    control.focus();
    await user.keyboard(" ");
    expect(onChange).toHaveBeenCalledTimes(1);
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("prevents changes while disabled", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Switch checked={false} disabled label="Enabled" onChange={onChange} />);

    await user.click(screen.getByRole("switch", { name: "Enabled" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
