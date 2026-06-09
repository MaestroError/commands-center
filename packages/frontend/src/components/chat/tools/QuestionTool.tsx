import { Check, CircleHelp } from "lucide-react";

import type { ToolRendererProps } from "./tool-registry";
import { getToolInput, getToolState } from "./tool-registry";

export function QuestionTool({ part }: ToolRendererProps) {
  const state = getToolState(part);
  const status = state?.["status"] as string | undefined;
  const input = getToolInput(part);
  const metadata = state?.["metadata"] as Record<string, unknown> | undefined;

  // Hidden while pending/running
  if (status === "pending" || status === "running") return null;

  const questions = (input?.["questions"] as Array<Record<string, unknown>> | undefined) ?? [];
  const answers = (metadata?.["answers"] as string[][] | undefined) ?? [];
  const answered = answers.some((answer) => answer && answer.length > 0);

  return (
    <div className="qa">
      <div className="qa-head">
        <span className="ico">
          <CircleHelp aria-hidden="true" className="h-4 w-4" />
        </span>
        <span className="label">Question</span>
        <span className={`state ${answered ? "ok" : "wait"}`}>
          <span className="sdot" />
          {answered ? "Answered" : "Waiting"}
        </span>
      </div>
      <div className="qa-body">
        {questions.length === 0 ? (
          <p className="qa-none">No questions.</p>
        ) : (
          questions.map((q, i) => {
            const questionText =
              (q["question"] as string | undefined) ?? `Question ${String(i + 1)}`;
            const answer = answers[i]?.flat() ?? [];

            return (
              <div key={i} className="qa-item">
                <div className="qa-q">{questionText}</div>
                {answer.length > 0 ? (
                  <div className="qa-answers">
                    {answer.map((value, j) => (
                      <span key={j} className="qa-a">
                        <span className="check">
                          <Check aria-hidden="true" className="h-3.5 w-3.5" />
                        </span>
                        {value}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="qa-none">No answer</span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
