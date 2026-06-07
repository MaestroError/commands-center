import { useState } from "react";

type QuestionOption = {
  label: string;
  description?: string;
};

type QuestionItem = {
  question: string;
  header?: string;
  options: QuestionOption[];
  multiSelect?: boolean;
};

type Question = {
  id: string;
  sessionID: string;
  questions: QuestionItem[];
};

type QuestionDockProps = {
  question: Question;
  onReply: (requestId: string, answers: string[][]) => void;
  onReject: (requestId: string) => void;
};

export function QuestionDock({ question, onReply, onReject }: QuestionDockProps) {
  const [answers, setAnswers] = useState<string[][]>(() => question.questions.map(() => []));
  const [customText, setCustomText] = useState<string[]>(() => question.questions.map(() => ""));

  function toggleOption(questionIndex: number, label: string, multiSelect: boolean) {
    setAnswers((prev) => {
      const updated = prev.map((a) => [...a]);
      const current = updated[questionIndex] ?? [];

      if (multiSelect) {
        if (current.includes(label)) {
          updated[questionIndex] = current.filter((l) => l !== label);
        } else {
          updated[questionIndex] = [...current, label];
        }
      } else {
        updated[questionIndex] = [label];
        // Single-select options are mutually exclusive with the custom answer.
        setCustomText((prevText) => {
          const text = [...prevText];
          text[questionIndex] = "";
          return text;
        });
      }

      return updated;
    });
  }

  function changeCustom(questionIndex: number, value: string, multiSelect: boolean) {
    setCustomText((prev) => {
      const updated = [...prev];
      updated[questionIndex] = value;
      return updated;
    });
    // For single-select, typing a custom answer clears any picked option.
    if (!multiSelect && value.trim()) {
      setAnswers((prev) => {
        const updated = prev.map((a) => [...a]);
        updated[questionIndex] = [];
        return updated;
      });
    }
  }

  function buildAnswers(): string[][] {
    return question.questions.map((_, i) => {
      const selected = answers[i] ?? [];
      const custom = (customText[i] ?? "").trim();
      return custom ? [...selected, custom] : selected;
    });
  }

  function handleSubmit() {
    onReply(question.id, buildAnswers());
  }

  function handleDismiss() {
    onReject(question.id);
  }

  return (
    <div className="border border-border rounded-lg p-4 bg-surface space-y-4">
      {question.questions.map((item, qIndex) => {
        const multiSelect = item.multiSelect ?? false;
        return (
          <div key={qIndex}>
            {item.header ? (
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1">
                {item.header}
              </p>
            ) : null}
            <p className="text-sm font-medium text-text-primary mb-2">{item.question}</p>
            {item.options.length > 0 ? (
              <div className="flex flex-wrap gap-2 mb-2">
                {item.options.map((opt) => {
                  const selected = (answers[qIndex] ?? []).includes(opt.label);
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      className={selected ? "cc-tab cc-tab-active" : "cc-tab"}
                      title={opt.description}
                      onClick={() => toggleOption(qIndex, opt.label, multiSelect)}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
            <textarea
              aria-label={item.question}
              className="cc-input w-full resize-y min-h-[2.5rem]"
              rows={2}
              placeholder={
                item.options.length > 0 ? "Type your own answer (optional)" : "Type your answer"
              }
              value={customText[qIndex] ?? ""}
              onChange={(e) => changeCustom(qIndex, e.target.value, multiSelect)}
            />
          </div>
        );
      })}

      <div className="flex items-center gap-2 pt-1">
        <button type="button" className="cc-button" onClick={handleSubmit}>
          Submit
        </button>
        <button type="button" className="cc-button-secondary" onClick={handleDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
