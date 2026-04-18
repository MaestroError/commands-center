import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { InterruptedDivider } from "./InterruptedDivider";

describe("InterruptedDivider", () => {
  it("renders the Interrupted text", () => {
    render(<InterruptedDivider />);
    expect(screen.getByText("Interrupted")).toBeInTheDocument();
  });
});
