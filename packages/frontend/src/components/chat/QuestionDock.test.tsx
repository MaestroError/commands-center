import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { QuestionDock } from "./QuestionDock";

function makeQuestion() {
  return {
    id: "question-1",
    sessionID: "session-1",
    questions: [
      {
        question: "Choose one option",
        options: [
          { label: "Option A", description: "first option" },
          { label: "Option B", description: "second option" },
        ],
      },
      {
        question: "Choose many options",
        header: "Advanced",
        multiSelect: true,
        options: [
          { label: "Alpha", description: "alpha" },
          { label: "Beta", description: "beta" },
        ],
      },
    ],
  };
}

describe("QuestionDock", () => {
  it("renders all question texts", () => {
    render(<QuestionDock question={makeQuestion()} onReply={vi.fn()} onReject={vi.fn()} />);

    expect(screen.getByText("Choose one option")).toBeInTheDocument();
    expect(screen.getByText("Choose many options")).toBeInTheDocument();
  });

  it("replaces the previous answer in single-select mode", () => {
    render(<QuestionDock question={makeQuestion()} onReply={vi.fn()} onReject={vi.fn()} />);

    const optionA = screen.getByRole("button", { name: "Option A" });
    const optionB = screen.getByRole("button", { name: "Option B" });

    fireEvent.click(optionA);
    expect(optionA.className).toContain("cc-tab-active");

    fireEvent.click(optionB);
    expect(optionA.className).not.toContain("cc-tab-active");
    expect(optionB.className).toContain("cc-tab-active");
  });

  it("accumulates and removes selections in multi-select mode", () => {
    render(<QuestionDock question={makeQuestion()} onReply={vi.fn()} onReject={vi.fn()} />);

    const alpha = screen.getByRole("button", { name: "Alpha" });
    const beta = screen.getByRole("button", { name: "Beta" });

    fireEvent.click(alpha);
    fireEvent.click(beta);
    expect(alpha.className).toContain("cc-tab-active");
    expect(beta.className).toContain("cc-tab-active");

    fireEvent.click(beta);
    expect(alpha.className).toContain("cc-tab-active");
    expect(beta.className).not.toContain("cc-tab-active");
  });

  it("calls onReply with the selected answers shape on submit", () => {
    const onReply = vi.fn();
    render(<QuestionDock question={makeQuestion()} onReply={onReply} onReject={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Option B" }));
    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    fireEvent.click(screen.getByRole("button", { name: "Beta" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onReply).toHaveBeenCalledWith("question-1", [["Option B"], ["Alpha", "Beta"]]);
  });

  it("calls onReject with the request id on dismiss", () => {
    const onReject = vi.fn();
    render(<QuestionDock question={makeQuestion()} onReply={vi.fn()} onReject={onReject} />);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(onReject).toHaveBeenCalledWith("question-1");
  });

  it("renders the optional header when present", () => {
    render(<QuestionDock question={makeQuestion()} onReply={vi.fn()} onReject={vi.fn()} />);

    expect(screen.getByText("Advanced")).toBeInTheDocument();
  });
});
