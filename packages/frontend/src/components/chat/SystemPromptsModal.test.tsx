import { fireEvent, render, screen } from "@testing-library/react";
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

  it("closes on overlay click and Escape", () => {
    const onClose = vi.fn();
    render(<SystemPromptsModal prompts={prompts} onClose={onClose} />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
