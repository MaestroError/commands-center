import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Checkbox } from "./checkbox";

describe("Checkbox", () => {
  it("reports checked changes through the CC-owned API", async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();
    render(<Checkbox aria-label="Permission" onCheckedChange={onCheckedChange} />);

    await user.click(screen.getByRole("checkbox", { name: "Permission" }));

    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("exposes the indeterminate state", () => {
    render(<Checkbox aria-label="Permission group" checked="indeterminate" />);

    expect(screen.getByRole("checkbox", { name: "Permission group" })).toHaveAttribute(
      "data-state",
      "indeterminate",
    );
  });
});
