import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { McpToolGroups } from "./McpToolGroups";

const catalog = [
  {
    server: "mail",
    available: true,
    tools: [{ id: "mail_send", name: "send", description: "Send mail" }],
  },
];
describe("MCP tool controls", () => {
  it("offers specialist ask permission", async () => {
    const onChange = vi.fn();
    render(<McpToolGroups catalog={catalog} onChange={onChange} />);
    expect(screen.getByText("mail tools").closest("details")).toHaveAttribute("open");
    await userEvent.click(screen.getByRole("button", { name: "mail send Ask" }));
    expect(onChange).toHaveBeenCalledWith([{ server: "mail", tool: "send", action: "ask" }]);
  });
  it("restricts autonomous controls to allow and deny", async () => {
    render(<McpToolGroups catalog={catalog} onChange={vi.fn()} taskMode />);
    expect(screen.getByText("mail tools").closest("details")).not.toHaveAttribute("open");
    await userEvent.click(screen.getByText("mail tools"));
    expect(screen.queryByRole("button", { name: "mail send Ask" })).toBeNull();
    expect(screen.getByRole("button", { name: "mail send Allow" })).toBeInTheDocument();
  });
  it("preserves unavailable rules until explicitly removed", async () => {
    const onChange = vi.fn();
    render(
      <McpToolGroups
        catalog={[]}
        rules={[{ server: "mail", tool: "send", action: "deny" }]}
        onChange={onChange}
      />,
    );
    expect(screen.getByText("Unavailable · deny")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Remove saved permission" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
