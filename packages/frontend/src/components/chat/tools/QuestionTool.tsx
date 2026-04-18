import type { ToolRendererProps } from "./tool-registry";
import { getToolInput, getToolState } from "./tool-registry";
import { BasicTool } from "./BasicTool";

export function QuestionTool({ part }: ToolRendererProps) {
  const state = getToolState(part);
  const status = state?.["status"] as string | undefined;
  const input = getToolInput(part);
  const metadata = state?.["metadata"] as Record<string, unknown> | undefined;

  // Hidden while pending/running
  if (status === "pending" || status === "running") return null;

  const questions = (input?.["questions"] as Array<Record<string, unknown>> | undefined) ?? [];
  const answers = (metadata?.["answers"] as string[][] | undefined) ?? [];

  return (
    <BasicTool title="Question" status={status} defaultExpanded={status === "completed"}>
      <div className="space-y-3">
        {questions.map((q, i) => {
          const questionText = (q["question"] as string | undefined) ?? `Question ${String(i + 1)}`;
          const answer = answers[i];

          return (
            <div key={i} className="space-y-1">
              <p className="text-xs font-medium text-text-primary">{questionText}</p>
              {answer ? (
                <p className="text-xs text-accent bg-accent/10 rounded-lg px-2 py-1">
                  {answer.flat().join(", ")}
                </p>
              ) : (
                <p className="text-xs text-text-secondary italic">No answer</p>
              )}
            </div>
          );
        })}
        {questions.length === 0 && <p className="text-xs text-text-secondary">No questions.</p>}
      </div>
    </BasicTool>
  );
}
