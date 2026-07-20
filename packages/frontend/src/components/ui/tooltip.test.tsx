import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

function TooltipExample() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button aria-label="Task information" type="button">
          Info
        </button>
      </TooltipTrigger>
      <TooltipContent>Supplementary task details</TooltipContent>
    </Tooltip>
  );
}

describe("Tooltip", () => {
  it("appears on hover and dismisses when hover leaves", async () => {
    const user = userEvent.setup();
    render(<TooltipExample />);
    const trigger = screen.getByRole("button", { name: "Task information" });

    await user.hover(trigger);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Supplementary task details");

    await user.unhover(trigger);
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
  });

  it("appears for keyboard focus and dismisses on Escape", async () => {
    const user = userEvent.setup();
    render(<TooltipExample />);

    await user.tab();
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Task information" })).toHaveFocus();
  });
});
