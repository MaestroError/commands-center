import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

describe("Command", () => {
  it("filters items and renders the CC empty state", () => {
    render(
      <Command label="Find model">
        <CommandInput aria-label="Find model" value="missing" />
        <CommandList>
          <CommandEmpty>No matches</CommandEmpty>
          <CommandItem value="model-one">Model one</CommandItem>
        </CommandList>
      </Command>,
    );

    expect(screen.getByRole("combobox", { name: "Find model" })).toHaveClass("cc-input");
    expect(screen.queryByRole("option", { name: "Model one" })).not.toBeInTheDocument();
    expect(screen.getByText("No matches")).toHaveClass("text-text-secondary");
  });
});
