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

  it("renders a free-text input for a question without options", () => {
    const onReply = vi.fn();
    const question = {
      id: "question-2",
      sessionID: "session-1",
      questions: [{ question: "Please provide more details:", options: [] }],
    };
    render(<QuestionDock question={question} onReply={onReply} onReject={vi.fn()} />);

    const input = screen.getByPlaceholderText("Type your answer");
    fireEvent.change(input, { target: { value: "here are the details" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onReply).toHaveBeenCalledWith("question-2", [["here are the details"]]);
  });

  it("appends a custom answer to selected options in multi-select mode", () => {
    const onReply = vi.fn();
    render(<QuestionDock question={makeQuestion()} onReply={onReply} onReject={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Option A" }));
    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));

    const inputs = screen.getAllByPlaceholderText("Type your own answer (optional)");
    fireEvent.change(inputs[1]!, { target: { value: "Gamma" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onReply).toHaveBeenCalledWith("question-1", [["Option A"], ["Alpha", "Gamma"]]);
  });

  it("custom answer replaces a single-select option", () => {
    const onReply = vi.fn();
    render(<QuestionDock question={makeQuestion()} onReply={onReply} onReject={vi.fn()} />);

    const optionA = screen.getByRole("button", { name: "Option A" });
    fireEvent.click(optionA);

    const inputs = screen.getAllByPlaceholderText("Type your own answer (optional)");
    fireEvent.change(inputs[0]!, { target: { value: "Something else" } });

    expect(optionA.className).not.toContain("cc-tab-active");

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(onReply).toHaveBeenCalledWith("question-1", [["Something else"], []]);
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
