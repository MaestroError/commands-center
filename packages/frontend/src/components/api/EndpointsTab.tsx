import { useMemo, useState } from "react";
import { Check, Clipboard } from "lucide-react";

import {
  buildTaskApiDocs,
  buildTemplateEndpointDocs,
  PUBLIC_API_TOKEN_PLACEHOLDER,
} from "@cc/shared/lib";

const TEMPLATE_ID_PLACEHOLDER = "<TEMPLATE_ID>";

function resolveBaseUrl(): string {
  return typeof window !== "undefined" ? window.location.origin : "";
}

export function EndpointsTab(props: { onGoToTokens?: () => void }) {
  const baseUrl = resolveBaseUrl();
  const docs = useMemo(
    () =>
      buildTemplateEndpointDocs({
        template: { id: TEMPLATE_ID_PLACEHOLDER, title: "Your template", description: "" },
        baseUrl,
      }),
    [baseUrl],
  );
  const taskDocs = useMemo(() => buildTaskApiDocs(baseUrl), [baseUrl]);

  const listCurl = [
    `curl '${docs.apiBaseUrl}/task-templates' \\`,
    `  -H 'Authorization: Bearer ${PUBLIC_API_TOKEN_PLACEHOLDER}'`,
  ].join("\n");

  return (
    <div className="mt-6 grid gap-6">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">Public API</h2>
        <p className="mt-1 text-sm leading-6 text-text-secondary">
          Trigger and schedule task templates over a versioned, bearer-authenticated HTTP API. Every
          request must include an{" "}
          <code className="rounded bg-app-bg px-1 py-0.5 font-mono text-xs">
            Authorization: Bearer cc_…
          </code>{" "}
          header.{" "}
          {props.onGoToTokens ? (
            <button
              className="text-accent underline-offset-2 hover:underline"
              onClick={props.onGoToTokens}
              type="button"
            >
              Create a token
            </button>
          ) : (
            "Create a token in the Tokens tab"
          )}{" "}
          with the <strong>Task Templates</strong> permission, then replace{" "}
          <code className="rounded bg-app-bg px-1 py-0.5 font-mono text-xs">
            {PUBLIC_API_TOKEN_PLACEHOLDER}
          </code>{" "}
          in the snippets below. Base URL: <code className="font-mono">{docs.apiBaseUrl}</code>
        </p>
      </div>

      <SectionHeading
        title="Templates"
        subtitle="Trigger and poll reusable task templates. Requires the Task Templates scope (the list endpoint also accepts the Tasks scope)."
      />

      <EndpointBlock
        method="GET"
        path="/api/public/v1/task-templates"
        scope="Task Templates or Tasks"
        description="List templates available to trigger (enabled templates only)."
        snippets={[{ label: "curl", code: listCurl }]}
        responseExample={{
          templates: [
            { id: "01J…", title: "Weekly report", description: "Summarise the week's activity." },
          ],
        }}
      />

      <EndpointBlock
        method="POST"
        path="/api/public/v1/task-templates/:id/trigger"
        scope="Task Templates"
        description="Trigger a template immediately, or schedule it for a future time by including a schedule block."
        snippets={[
          { label: "curl (trigger now)", code: docs.triggerCurl },
          { label: "curl (schedule)", code: docs.scheduleCurl },
          { label: "JavaScript", code: docs.triggerJs },
        ]}
        responseExample={{ taskId: "01J…", runId: "01J…", status: "queued", scheduledFor: null }}
      />

      <EndpointBlock
        method="GET"
        path="/api/public/v1/task-runs/:runId"
        scope="Task Templates"
        description="Poll the status of a triggered run until it reaches a terminal state."
        snippets={[{ label: "curl", code: docs.pollCurl }]}
        responseExample={{
          runId: "01J…",
          taskId: "01J…",
          status: "completed",
          outcome: "success",
          finalMessage: "Report generated and posted.",
          startedAt: "2026-06-02T10:00:00Z",
          completedAt: "2026-06-02T10:02:30Z",
        }}
      />

      <SectionHeading
        title="Tasks"
        subtitle="Create, trigger, schedule, and inspect workspace tasks directly. All endpoints in this section require the Tasks scope."
      />

      <EndpointBlock
        method="GET"
        path="/api/public/v1/specialists"
        scope="Tasks"
        description="Discover specialist IDs so you can create a task against a specific specialist."
        snippets={[{ label: "curl", code: taskDocs.specialistsCurl }]}
        responseExample={{
          specialists: [{ id: "01J…", name: "Researcher", slug: "researcher" }],
        }}
      />

      <EndpointBlock
        method="POST"
        path="/api/public/v1/tasks"
        scope="Tasks"
        description="Create a task against a specialist. Include scheduledAt to create it in the scheduled state; attachments are inline base64 data URLs (≤10 MB each)."
        snippets={[{ label: "curl", code: taskDocs.createCurl }]}
        responseExample={{
          id: "01J…",
          title: "Audit the staging logs",
          status: "backlog",
          agentId: "01J…",
          todos: [],
          scheduledAt: null,
          dueAt: null,
          doneAt: null,
          latestRunId: null,
          latestFinalMessage: null,
          sourceTemplateId: null,
          createdAt: "2026-06-02T10:00:00Z",
          updatedAt: "2026-06-02T10:00:00Z",
        }}
      />

      <EndpointBlock
        method="GET"
        path="/api/public/v1/tasks?status=&templateId="
        scope="Tasks"
        description="List tasks by board status (backlog | queued | ready_to_check | review), and/or filter by the source template they were generated from."
        snippets={[
          { label: "curl (by status)", code: taskDocs.listByStatusCurl },
          { label: "curl (by template)", code: taskDocs.listByTemplateCurl },
        ]}
        responseExample={{
          tasks: [{ id: "01J…", title: "Audit the staging logs", status: "ready_to_check" }],
        }}
      />

      <EndpointBlock
        method="GET"
        path="/api/public/v1/tasks/:id"
        scope="Tasks"
        description="Get one task. Use ?expand=runs,feedback to embed its runs and feedback threads in a single fetch."
        snippets={[
          { label: "curl", code: taskDocs.getCurl },
          { label: "curl (expanded)", code: taskDocs.getExpandCurl },
        ]}
        responseExample={{ id: "01J…", title: "Audit the staging logs", status: "queued" }}
      />

      <EndpointBlock
        method="POST"
        path="/api/public/v1/tasks/:id/trigger"
        scope="Tasks"
        description="Run a task now."
        snippets={[{ label: "curl", code: taskDocs.triggerCurl }]}
        responseExample={{ taskId: "01J…", runId: "01J…", status: "queued" }}
      />

      <EndpointBlock
        method="POST"
        path="/api/public/v1/tasks/:id/schedule"
        scope="Tasks"
        description="Schedule or reschedule a task for a future time. Send runAt: null to clear the schedule."
        snippets={[{ label: "curl", code: taskDocs.scheduleCurl }]}
        responseExample={{ id: "01J…", status: "scheduled", scheduledAt: "2026-06-10T09:00:00Z" }}
      />

      <EndpointBlock
        method="GET"
        path="/api/public/v1/tasks/:id/runs"
        scope="Tasks"
        description="List the runs of a task."
        snippets={[{ label: "curl", code: taskDocs.runsCurl }]}
        responseExample={{ runs: [{ id: "01J…", taskId: "01J…", status: "completed" }] }}
      />

      <EndpointBlock
        method="GET"
        path="/api/public/v1/tasks/:id/runs/:runId"
        scope="Tasks"
        description="Get a single run of a task."
        snippets={[{ label: "curl", code: taskDocs.runDetailCurl }]}
        responseExample={{ id: "01J…", taskId: "01J…", status: "completed", outcome: "success" }}
      />

      <EndpointBlock
        method="GET"
        path="/api/public/v1/tasks/:id/feedback"
        scope="Tasks"
        description="Read the feedback threads on a task, including their subtasks and per-subtask run replies."
        snippets={[{ label: "curl", code: taskDocs.feedbackCurl }]}
        responseExample={{
          feedback: [{ id: "01J…", taskId: "01J…", body: "Please verify docs.", subtasks: [] }],
        }}
      />
    </div>
  );
}

function SectionHeading(props: { title: string; subtitle: string }) {
  return (
    <div className="border-b border-border pb-2">
      <h3 className="text-lg font-semibold text-text-primary">{props.title}</h3>
      <p className="mt-1 text-sm leading-6 text-text-secondary">{props.subtitle}</p>
    </div>
  );
}

function EndpointBlock(props: {
  method: string;
  path: string;
  scope: string;
  description: string;
  snippets: Array<{ label: string; code: string }>;
  responseExample: unknown;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-accent/30 bg-accent/10 px-2 py-1 font-mono text-xs font-semibold text-text-primary">
          {props.method}
        </span>
        <code className="font-mono text-sm text-text-primary">{props.path}</code>
        <span className="ml-auto rounded-full border border-border bg-app-bg px-2 py-1 text-xs text-text-secondary">
          Scope: {props.scope}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-text-secondary">{props.description}</p>

      <div className="mt-4 grid gap-4">
        {props.snippets.map((snippet) => (
          <CopyableCode code={snippet.code} key={snippet.label} label={snippet.label} />
        ))}
        <CopyableCode
          code={JSON.stringify(props.responseExample, null, 2)}
          label="Example response"
        />
      </div>
    </section>
  );
}

export function CopyableCode(props: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const clipboardAvailable = typeof navigator !== "undefined" && Boolean(navigator.clipboard);

  async function copy(): Promise<void> {
    if (!clipboardAvailable) {
      return;
    }

    await navigator.clipboard.writeText(props.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-app-bg">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-[0.15em] text-text-muted">
          {props.label}
        </span>
        <button
          className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary"
          disabled={!clipboardAvailable}
          onClick={() => void copy()}
          title={clipboardAvailable ? "Copy" : "Clipboard is unavailable"}
          type="button"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-5 text-text-primary">
        <code>{props.code}</code>
      </pre>
    </div>
  );
}
