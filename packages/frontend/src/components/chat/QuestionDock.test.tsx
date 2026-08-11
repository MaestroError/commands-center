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

function option(label: string) {
  return screen.getByRole("button", { name: new RegExp(`^${label}`) });
}

function next() {
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
}

describe("QuestionDock", () => {
  it("renders one question at a time", () => {
    render(<QuestionDock question={makeQuestion()} onReply={vi.fn()} onReject={vi.fn()} />);

    expect(screen.getByText("Choose one option")).toBeInTheDocument();
    expect(screen.queryByText("Choose many options")).not.toBeInTheDocument();

    next();

    expect(screen.queryByText("Choose one option")).not.toBeInTheDocument();
    expect(screen.getByText("Choose many options")).toBeInTheDocument();
  });

  it("shows the step counter and only offers Submit on the last step", () => {
    render(<QuestionDock question={makeQuestion()} onReply={vi.fn()} onReject={vi.fn()} />);

    expect(screen.getByText("Question 1 of 2")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit" })).not.toBeInTheDocument();

    next();

    expect(screen.getByText("Question 2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
  });

  it("keeps selections when navigating back to an earlier step", () => {
    render(<QuestionDock question={makeQuestion()} onReply={vi.fn()} onReject={vi.fn()} />);

    fireEvent.click(option("Option B"));
    next();
    fireEvent.click(screen.getByRole("button", { name: "Prev" }));

    expect(option("Option B").className).toContain("cc-tab-active");
    expect(option("Option A").className).not.toContain("cc-tab-active");
  });

  it("disables Prev on the first step", () => {
    render(<QuestionDock question={makeQuestion()} onReply={vi.fn()} onReject={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Prev" })).toBeDisabled();

    next();

    expect(screen.getByRole("button", { name: "Prev" })).toBeEnabled();
  });

  it("renders no stepper controls for a single question", () => {
    const question = {
      id: "question-3",
      sessionID: "session-1",
      questions: [{ question: "Only one", options: [{ label: "Yes" }] }],
    };
    render(<QuestionDock question={question} onReply={vi.fn()} onReject={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Prev" })).not.toBeInTheDocument();
    expect(screen.queryByText("Question 1 of 1")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit" })).toBeInTheDocument();
  });

  it("stays answerable when the request carries no questions", () => {
    // The shared schema allows an empty questions array, and the dock replaces
    // the composer while a request is pending — rendering nothing would leave
    // the chat with no way out.
    const onReply = vi.fn();
    const onReject = vi.fn();
    const question = { id: "question-4", sessionID: "session-1", questions: [] };
    render(<QuestionDock question={question} onReply={onReply} onReject={onReject} />);

    expect(screen.getByText("This request has no questions to answer.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(onReply).toHaveBeenCalledWith("question-4", []);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onReject).toHaveBeenCalledWith("question-4");
  });

  it("replaces the previous answer in single-select mode", () => {
    render(<QuestionDock question={makeQuestion()} onReply={vi.fn()} onReject={vi.fn()} />);

    const optionA = option("Option A");
    const optionB = option("Option B");

    fireEvent.click(optionA);
    expect(optionA.className).toContain("cc-tab-active");

    fireEvent.click(optionB);
    expect(optionA.className).not.toContain("cc-tab-active");
    expect(optionB.className).toContain("cc-tab-active");
  });

  it("accumulates and removes selections in multi-select mode", () => {
    render(<QuestionDock question={makeQuestion()} onReply={vi.fn()} onReject={vi.fn()} />);

    next();
    const alpha = option("Alpha");
    const beta = option("Beta");

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

    fireEvent.click(option("Option B"));
    next();
    fireEvent.click(option("Alpha"));
    fireEvent.click(option("Beta"));
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

    fireEvent.click(option("Option A"));
    next();
    fireEvent.click(option("Alpha"));

    fireEvent.change(screen.getByPlaceholderText("Type your own answer (optional)"), {
      target: { value: "Gamma" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onReply).toHaveBeenCalledWith("question-1", [["Option A"], ["Alpha", "Gamma"]]);
  });

  it("custom answer replaces a single-select option", () => {
    const onReply = vi.fn();
    render(<QuestionDock question={makeQuestion()} onReply={onReply} onReject={vi.fn()} />);

    const optionA = option("Option A");
    fireEvent.click(optionA);

    fireEvent.change(screen.getByPlaceholderText("Type your own answer (optional)"), {
      target: { value: "Something else" },
    });

    expect(optionA.className).not.toContain("cc-tab-active");

    next();
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(onReply).toHaveBeenCalledWith("question-1", [["Something else"], []]);
  });

  it("advances with Cmd+Enter and submits from the last step", () => {
    const onReply = vi.fn();
    render(<QuestionDock question={makeQuestion()} onReply={onReply} onReject={vi.fn()} />);

    fireEvent.keyDown(screen.getByPlaceholderText("Type your own answer (optional)"), {
      key: "Enter",
      metaKey: true,
    });

    expect(screen.getByText("Choose many options")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByPlaceholderText("Type your own answer (optional)"), {
      key: "Enter",
      metaKey: true,
    });

    expect(onReply).toHaveBeenCalledWith("question-1", [[], []]);
  });

  it("calls onReject with the request id on dismiss", () => {
    const onReject = vi.fn();
    render(<QuestionDock question={makeQuestion()} onReply={vi.fn()} onReject={onReject} />);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(onReject).toHaveBeenCalledWith("question-1");
  });

  it("renders the optional header when present", () => {
    render(<QuestionDock question={makeQuestion()} onReply={vi.fn()} onReject={vi.fn()} />);

    next();

    expect(screen.getByText("Advanced")).toBeInTheDocument();
  });

  it("renders option descriptions as visible text", () => {
    render(<QuestionDock question={makeQuestion()} onReply={vi.fn()} onReject={vi.fn()} />);

    expect(screen.getByText("first option")).toBeInTheDocument();
    expect(screen.getByText("second option")).toBeInTheDocument();
  });
});
