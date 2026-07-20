import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmptyState, ErrorState, LoadingState } from "./PageStates";

describe("PageStates", () => {
  it("renders six loading surfaces and preserves the test id", () => {
    render(<LoadingState testId="loading" />);

    const loading = screen.getByTestId("loading");
    expect(loading.children).toHaveLength(6);
    expect(loading.firstElementChild).toHaveClass("cc-panel");
  });

  it("renders a static error with its action without forcing a live region", () => {
    render(
      <ErrorState
        action={<button type="button">Retry</button>}
        description="Try again."
        title="Could not load"
      />,
    );

    expect(screen.getByText("Could not load").closest("section")).toHaveClass("cc-alert");
    expect(screen.getByText("Could not load").closest("section")).not.toHaveAttribute("role");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("renders empty copy and action through the empty surface", () => {
    render(
      <EmptyState
        action={<button type="button">Create</button>}
        description="Create the first one."
        testId="empty"
        title="Nothing here"
      />,
    );

    expect(screen.getByTestId("empty")).toHaveClass("cc-empty-state");
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });
});
