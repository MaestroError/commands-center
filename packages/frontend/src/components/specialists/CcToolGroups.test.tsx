import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CcToolGroups } from "./CcToolGroups";

const groups = [
  {
    name: "cc_test",
    description: "Test tools",
    enabledByDefault: true,
    tools: [{ name: "lookup", description: "Look up an item", context: "both" as const }],
  },
];

describe("CC tool permission controls", () => {
  it.each(["Allow", "Ask", "Deny"])("lets specialists select %s per tool", async (label) => {
    const changed = vi.fn();
    render(
      <CcToolGroups
        groups={groups}
        capabilities={{ appMcpServers: [{ name: "cc_test", enabled: true, action: "allow" }] }}
        onGroupChange={() => {}}
        onToolChange={changed}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: `cc_test lookup ${label}` }));
    expect(changed).toHaveBeenCalledWith("cc_test", "lookup", label.toLowerCase());
  });

  it("shows inherited Ask selected in specialist configuration", () => {
    render(
      <CcToolGroups
        groups={groups}
        capabilities={{ appMcpServers: [{ name: "cc_test", enabled: true, action: "ask" }] }}
        onGroupChange={() => {}}
        onToolChange={() => {}}
      />,
    );
    expect(screen.getByText("cc_test tools").closest("details")).toHaveAttribute("open");
    expect(screen.getByRole("button", { name: "cc_test lookup Ask" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("keeps task controls binary", async () => {
    const changed = vi.fn();
    render(
      <CcToolGroups
        groups={groups}
        capabilities={{}}
        taskMode
        onGroupChange={() => {}}
        onToolChange={changed}
      />,
    );
    expect(screen.queryByRole("button", { name: /Ask/ })).not.toBeInTheDocument();
    expect(screen.getByText("cc_test tools").closest("details")).not.toHaveAttribute("open");
    await userEvent.click(screen.getByText("cc_test tools"));
    await userEvent.click(screen.getByRole("button", { name: "cc_test lookup Allow" }));
    expect(changed).toHaveBeenCalledWith("cc_test", "lookup", "allow");
  });
});
