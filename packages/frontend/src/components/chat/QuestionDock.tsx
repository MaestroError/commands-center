import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

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
  // Only one question is on screen at a time; answers stay indexed by the real
  // question index so navigating back and forth never reshuffles them.
  const [step, setStep] = useState(0);

  const questionRef = useRef<HTMLParagraphElement>(null);
  const mountedRef = useRef(false);

  const total = question.questions.length;
  const isFirstStep = step === 0;
  const isLastStep = step >= total - 1;

  useEffect(() => {
    // Land keyboard and screen-reader users on the new question instead of
    // leaving focus on a button that may have just disappeared. Skipped on
    // mount so an arriving question does not steal focus from the composer.
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    questionRef.current?.focus();
  }, [step]);

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

  function goPrev() {
    setStep((current) => Math.max(0, current - 1));
  }

  function goNext() {
    setStep((current) => Math.min(total - 1, current + 1));
  }

  // The shared schema does not require a non-empty questions array, so the
  // dock has to stay answerable even when there is nothing to ask: it replaces
  // the composer while a request is pending, and rendering nothing would leave
  // the chat with no way to reply or dismiss.
  const item = question.questions[step];
  const multiSelect = item?.multiSelect ?? false;
  const showStepper = total > 1;

  return (
    <div className="flex max-h-[60vh] flex-col rounded-lg border border-border bg-surface">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {!item ? (
          <p className="text-sm text-text-secondary">This request has no questions to answer.</p>
        ) : (
          <>
            <div className="space-y-2" aria-live="polite">
              <div className="flex items-baseline justify-between gap-3">
                {item.header ? (
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    {item.header}
                  </p>
                ) : (
                  <span />
                )}
                {showStepper ? (
                  <p className="shrink-0 text-xs text-text-secondary">
                    Question {step + 1} of {total}
                  </p>
                ) : null}
              </div>

              {showStepper ? (
                <div className="flex gap-1" aria-hidden="true">
                  {question.questions.map((_, i) => (
                    <span
                      key={i}
                      className={`h-1 flex-1 rounded-full ${i <= step ? "bg-accent" : "bg-border"}`}
                    />
                  ))}
                </div>
              ) : null}

              <p
                ref={questionRef}
                tabIndex={-1}
                className="text-sm font-medium text-text-primary outline-none"
              >
                {item.question}
              </p>
            </div>

            {item.options.length > 0 ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {item.options.map((opt) => {
                  const selected = (answers[step] ?? []).includes(opt.label);
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      className={selected ? "cc-tab cc-tab-active" : "cc-tab"}
                      aria-pressed={selected}
                      onClick={() => toggleOption(step, opt.label, multiSelect)}
                    >
                      {/* Inner column so the label and its description stack and
                      stay left-aligned inside the pill's centered flex row. */}
                      <span className="flex w-full flex-col gap-0.5 text-left">
                        <span
                          className={selected ? "font-medium" : "font-medium text-text-primary"}
                        >
                          {opt.label}
                        </span>
                        {opt.description ? (
                          <span
                            className={`text-xs ${selected ? "opacity-80" : "text-text-secondary"}`}
                          >
                            {opt.description}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            <Textarea
              aria-label={item.question}
              className="min-h-[2.5rem] w-full resize-y"
              rows={2}
              placeholder={
                item.options.length > 0 ? "Type your own answer (optional)" : "Type your answer"
              }
              value={customText[step] ?? ""}
              onChange={(e) => changeCustom(step, e.target.value, multiSelect)}
              onKeyDown={(e) => {
                // Plain Enter stays a newline; Cmd/Ctrl+Enter advances or submits.
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  if (isLastStep) {
                    handleSubmit();
                  } else {
                    goNext();
                  }
                }
              }}
            />
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border p-3">
        {showStepper ? (
          <Button type="button" variant="secondary" disabled={isFirstStep} onClick={goPrev}>
            Prev
          </Button>
        ) : null}
        {isLastStep ? (
          <Button type="button" onClick={handleSubmit}>
            Submit
          </Button>
        ) : (
          <Button type="button" onClick={goNext}>
            Next
          </Button>
        )}
        <Button type="button" onClick={handleDismiss} variant="secondary">
          Dismiss
        </Button>
      </div>
    </div>
  );
}
