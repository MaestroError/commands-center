import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./button";

describe("Button", () => {
  it("defaults to the primary compatibility contract", () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveClass("cc-button");
    expect(button).not.toHaveClass("cc-button-secondary");
    expect(button).not.toHaveClass("cc-button-danger");
  });

  it("renders the secondary variant classes", () => {
    render(<Button variant="secondary">Cancel</Button>);
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveClass(
      "cc-button",
      "cc-button-secondary",
    );
  });

  it("renders the danger variant classes", () => {
    render(<Button variant="danger">Delete</Button>);
    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass(
      "cc-button",
      "cc-button-danger",
    );
  });

  it("defaults to type=button but respects an explicit type", () => {
    const { rerender } = render(<Button>Default</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
    rerender(<Button type="submit">Submit</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
  });

  it("forwards native button props", () => {
    render(
      <Button name="action" value="publish" aria-label="Publish now" form="editor">
        Publish
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Publish now" });
    expect(button).toHaveAttribute("name", "action");
    expect(button).toHaveAttribute("value", "publish");
    expect(button).toHaveAttribute("form", "editor");
  });

  it("forwards a ref to the underlying button element", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Ref</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it("invokes onClick when activated", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Go</Button>);
    await user.click(screen.getByRole("button", { name: "Go" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not invoke onClick when disabled", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button disabled onClick={onClick}>
        Go
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Go" });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("composes consumer className without dropping the variant contract", () => {
    render(
      <Button variant="secondary" className="w-full mt-4">
        Wide
      </Button>,
    );
    expect(screen.getByRole("button", { name: "Wide" })).toHaveClass(
      "cc-button",
      "cc-button-secondary",
      "w-full",
      "mt-4",
    );
  });
});
