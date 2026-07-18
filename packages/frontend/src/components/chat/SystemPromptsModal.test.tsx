import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ResolvedSystemPrompt } from "@cc/shared/schemas";

import { SystemPromptsModal } from "./SystemPromptsModal";

const prompts: ResolvedSystemPrompt[] = [
  {
    id: "identity",
    title: "Identity",
    description: "",
    scope: "both",
    danger: true,
    optional: false,
    enabled: true,
    isCustomized: false,
    renderedBody: "You are Ada.",
  },
];

describe("SystemPromptsModal", () => {
  it("renders snapshot sections read-only and expands the body on click", () => {
    render(<SystemPromptsModal prompts={prompts} onClose={vi.fn()} />);

    expect(screen.getByText("Identity")).toBeInTheDocument();
    expect(screen.queryByText("You are Ada.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Identity"));
    expect(screen.getByText("You are Ada.")).toBeInTheDocument();
  });

  it("shows the fallback notice when prompts are the current configuration", () => {
    render(<SystemPromptsModal prompts={prompts} isFallback onClose={vi.fn()} />);
    expect(screen.getByText(/not captured at send time/i)).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<SystemPromptsModal prompts={prompts} onClose={onClose} />);

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on overlay click", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<SystemPromptsModal prompts={prompts} onClose={onClose} />);

    const backdrop = document.querySelector<HTMLElement>('[data-slot="dialog-overlay"]');
    expect(backdrop).not.toBeNull();
    await user.click(backdrop!);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
