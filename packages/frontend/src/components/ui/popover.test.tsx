import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

describe("Popover", () => {
  it("opens portalled semantic content and dismisses on Escape", async () => {
    const user = userEvent.setup();
    render(
      <Popover>
        <PopoverTrigger>Choose</PopoverTrigger>
        <PopoverContent>Choices</PopoverContent>
      </Popover>,
    );

    await user.click(screen.getByRole("button", { name: "Choose" }));
    expect(screen.getByText("Choices")).toHaveClass("bg-surface", "border-border");

    await user.keyboard("{Escape}");
    expect(screen.queryByText("Choices")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose" })).toHaveFocus();
  });
});
