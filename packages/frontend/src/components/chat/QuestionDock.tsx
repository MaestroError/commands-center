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
      }

      return updated;
    });
  }

  function handleSubmit() {
    onReply(question.id, answers);
  }

  function handleDismiss() {
    onReject(question.id);
  }

  return (
    <div className="border border-border rounded-2xl p-4 bg-surface space-y-4">
      {question.questions.map((item, qIndex) => (
        <div key={qIndex}>
          {item.header ? (
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1">
              {item.header}
            </p>
          ) : null}
          <p className="text-sm font-medium text-text-primary mb-2">{item.question}</p>
          <div className="flex flex-wrap gap-2">
            {item.options.map((opt) => {
              const selected = (answers[qIndex] ?? []).includes(opt.label);
              return (
                <button
                  key={opt.label}
                  type="button"
                  className={selected ? "cc-tab cc-tab-active" : "cc-tab"}
                  title={opt.description}
                  onClick={() => toggleOption(qIndex, opt.label, item.multiSelect ?? false)}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}

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
