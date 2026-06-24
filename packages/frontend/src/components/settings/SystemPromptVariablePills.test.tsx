import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SystemPromptVariableMeta } from "@cc/shared/schemas";

import { SystemPromptVariablePills } from "./SystemPromptVariablePills";

const variables: SystemPromptVariableMeta[] = [
  { id: "APP_NAME", label: "App name", description: "The application name." },
  { id: "SPECIALIST_NAME", label: "Specialist name", description: "The specialist's name." },
];

beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

describe("SystemPromptVariablePills", () => {
  it("renders a pill per declared variable", () => {
    render(<SystemPromptVariablePills variables={variables} />);
    expect(screen.getByText("{{ APP_NAME }}")).toBeInTheDocument();
    expect(screen.getByText("{{ SPECIALIST_NAME }}")).toBeInTheDocument();
  });

  it("copies the token and shows Copied feedback on click", async () => {
    render(<SystemPromptVariablePills variables={variables} />);

    fireEvent.click(screen.getByText("{{ APP_NAME }}"));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("{{ APP_NAME }}");
    await waitFor(() => {
      expect(screen.getByText("Copied")).toBeInTheDocument();
    });
  });

  it("renders nothing when there are no variables", () => {
    const { container } = render(<SystemPromptVariablePills variables={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
