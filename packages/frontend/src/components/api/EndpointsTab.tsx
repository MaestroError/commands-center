import { useMemo, useState } from "react";
import { Check, Clipboard } from "lucide-react";

import {
  buildTaskApiDocs,
  buildDocumentApiDocs,
  buildTemplateEndpointDocs,
  PUBLIC_API_TOKEN_PLACEHOLDER,
} from "@cc/shared/lib";

import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { resetOAuthRuntime } from "@/lib/api/oauth";

const TEMPLATE_ID_PLACEHOLDER = "<TEMPLATE_ID>";

function resolveBaseUrl(): string {
  return typeof window !== "undefined" ? window.location.origin : "";
}

export function EndpointsTab(props: { onGoToTokens?: () => void }) {
  const baseUrl = resolveBaseUrl();
  const mcpEndpoint = `${baseUrl}/api/public/mcp`;
  const mcpAuthorizationHeader = `Authorization: Bearer ${PUBLIC_API_TOKEN_PLACEHOLDER}`;
  const [confirmingOAuthReset, setConfirmingOAuthReset] = useState(false);
  const [resettingOAuth, setResettingOAuth] = useState(false);
  const [oauthResetComplete, setOAuthResetComplete] = useState(false);
  const [oauthResetError, setOAuthResetError] = useState<string | null>(null);
  const docs = useMemo(
    () =>
      buildTemplateEndpointDocs({
        template: { id: TEMPLATE_ID_PLACEHOLDER, title: "Your template", description: "" },
        baseUrl,
      }),
    [baseUrl],
  );
  const taskDocs = useMemo(() => buildTaskApiDocs(baseUrl), [baseUrl]);
  const documentDocs = useMemo(() => buildDocumentApiDocs(baseUrl), [baseUrl]);

  const listCurl = [
    `curl '${docs.apiBaseUrl}/task-templates' \\`,
    `  -H 'Authorization: Bearer ${PUBLIC_API_TOKEN_PLACEHOLDER}'`,
  ].join("\n");

  async function resetOAuthConnections(): Promise<void> {
    setConfirmingOAuthReset(false);
    setResettingOAuth(true);
    setOAuthResetComplete(false);
    setOAuthResetError(null);

    try {
      await resetOAuthRuntime();
      setOAuthResetComplete(true);
    } catch (error) {
      setOAuthResetError(
        error instanceof Error ? error.message : "OAuth connections could not be reset.",
      );
    } finally {
      setResettingOAuth(false);
    }
  }

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
        title="MCP server"
        subtitle="Connect an MCP client (Claude Code, Cursor, VS Code, …) to drive templates and tasks as tools over one Streamable-HTTP endpoint."
      />
      <section className="rounded-xl border border-border bg-surface p-5">
        <p className="text-sm leading-6 text-text-secondary">
          Point your MCP client at the endpoint below. Each tool is gated by the API token&apos;s
          permissions — a client only sees the tools its token allows. Document tools also enforce
          the token&apos;s document roots and recursive global-folder grants.
        </p>
        <div className="mt-4 grid gap-4">
          <CopyableCode code={mcpEndpoint} label="MCP endpoint" />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-border bg-app-bg p-4">
              <h4 className="font-medium text-text-primary">Automatic OAuth</h4>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                Recommended for interactive MCP clients. Add the endpoint without credentials. The
                client discovers OAuth, registers automatically, and opens a CommandsCenter page
                where you approve access by pasting an API token.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-app-bg p-4">
              <h4 className="font-medium text-text-primary">Bearer header</h4>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                Use this for clients that support a fixed authorization header. The API token is
                validated on every request, so revocation and permission changes take effect
                immediately.
              </p>
            </div>
          </div>
          <CopyableCode code={mcpAuthorizationHeader} label="Static authorization header" />
          <p className="text-sm leading-6 text-text-secondary">
            Credentials in URL query parameters are rejected. There is no compatibility setting to
            re-enable them. Rotate any API token that was previously stored in a URL.
          </p>
          <div className="border-t border-border pt-4">
            <h4 className="font-medium text-text-primary">OAuth connection recovery</h4>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Reset registered OAuth clients, grants, OAuth access tokens, and the registration
              retry limit when clients cannot reconnect after an origin or proxy change. Every OAuth
              MCP client must connect again. CommandsCenter API tokens and their permissions are
              preserved.
            </p>
            <Button
              className="mt-3"
              disabled={resettingOAuth}
              onClick={() => {
                setOAuthResetComplete(false);
                setOAuthResetError(null);
                setConfirmingOAuthReset(true);
              }}
              variant="secondary"
            >
              {resettingOAuth ? "Resetting…" : "Reset OAuth connections"}
            </Button>
            {oauthResetComplete ? (
              <p
                className="mt-3 rounded-lg border border-success-border bg-success-surface p-3 text-sm text-success-foreground"
                role="status"
              >
                OAuth connections were reset. Existing OAuth clients must connect again.
              </p>
            ) : null}
            {oauthResetError ? (
              <p
                className="mt-3 rounded-lg border border-danger-border bg-danger-surface p-3 text-sm text-danger-foreground"
                role="alert"
              >
                {oauthResetError}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {confirmingOAuthReset ? (
        <ConfirmDialog
          confirmLabel="Reset connections"
          confirmVariant="danger"
          description="This clears every registered OAuth client, grant, and OAuth access token. All OAuth MCP clients will lose access and must connect again. CommandsCenter API tokens and their permissions will not be deleted."
          onCancel={() => setConfirmingOAuthReset(false)}
          onConfirm={() => void resetOAuthConnections()}
          title="Reset all OAuth connections?"
        />
      ) : null}

      <SectionHeading
        title="Templates"
        subtitle="Trigger and poll reusable task templates. Each endpoint needs its matching token permission; the Task Templates preset enables them all."
      />

      <EndpointBlock
        method="GET"
        path="/api/public/v1/task-templates"
        scope="List templates"
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
        scope="Trigger template"
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
        scope="Get template run status"
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
        subtitle="Create, trigger, schedule, and inspect workspace tasks directly. Each endpoint needs its matching token permission; the Tasks preset enables them all."
      />

      <EndpointBlock
        method="GET"
        path="/api/public/v1/specialists"
        scope="List specialists"
        description="Discover specialist IDs so you can create a task against a specific specialist."
        snippets={[{ label: "curl", code: taskDocs.specialistsCurl }]}
        responseExample={{
          specialists: [{ id: "01J…", name: "Researcher", slug: "researcher" }],
        }}
      />

      <EndpointBlock
        method="POST"
        path="/api/public/v1/task-templates/:id/enable"
        scope="Enable template"
        description="Activate a template so it runs on its schedule and accepts automated triggers again. Leaves the schedule and all other settings unchanged."
        snippets={[{ label: "curl", code: taskDocs.enableTemplateCurl }]}
        responseExample={{ id: "01J…", title: "Weekly report", description: "", enabled: true }}
      />

      <EndpointBlock
        method="POST"
        path="/api/public/v1/task-templates/:id/disable"
        scope="Disable template"
        description="Deactivate a template without changing its schedule. A disabled template stops generating scheduled runs and is refused by trigger endpoints, but is kept for reference and can be re-enabled."
        snippets={[{ label: "curl", code: taskDocs.disableTemplateCurl }]}
        responseExample={{ id: "01J…", title: "Weekly report", description: "", enabled: false }}
      />

      <EndpointBlock
        method="POST"
        path="/api/public/v1/tasks"
        scope="Create task"
        description="Create a task against a specialist. Include scheduledAt to create it in the scheduled state; attachments are inline base64 data URLs (≤10 MB each)."
        snippets={[{ label: "curl", code: taskDocs.createCurl }]}
        responseExample={{
          id: "01J…",
          title: "Audit the staging logs",
          status: "backlog",
          specialistId: "01J…",
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
        scope="List tasks"
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
        scope="Get task"
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
        scope="Trigger task"
        description="Run a task now."
        snippets={[{ label: "curl", code: taskDocs.triggerCurl }]}
        responseExample={{ taskId: "01J…", runId: "01J…", status: "queued" }}
      />

      <EndpointBlock
        method="POST"
        path="/api/public/v1/tasks/:id/schedule"
        scope="Schedule task"
        description="Schedule or reschedule a task for a future time. Send runAt: null to clear the schedule."
        snippets={[{ label: "curl", code: taskDocs.scheduleCurl }]}
        responseExample={{ id: "01J…", status: "scheduled", scheduledAt: "2026-06-10T09:00:00Z" }}
      />

      <EndpointBlock
        method="GET"
        path="/api/public/v1/tasks/:id/runs"
        scope="List task runs"
        description="List the runs of a task."
        snippets={[{ label: "curl", code: taskDocs.runsCurl }]}
        responseExample={{ runs: [{ id: "01J…", taskId: "01J…", status: "completed" }] }}
      />

      <EndpointBlock
        method="GET"
        path="/api/public/v1/tasks/:id/runs/:runId"
        scope="Get task run"
        description="Get a single run of a task."
        snippets={[{ label: "curl", code: taskDocs.runDetailCurl }]}
        responseExample={{ id: "01J…", taskId: "01J…", status: "completed", outcome: "success" }}
      />

      <EndpointBlock
        method="GET"
        path="/api/public/v1/tasks/:id/feedback"
        scope="List task feedback"
        description="Read the feedback threads on a task, including their subtasks and per-subtask run replies."
        snippets={[{ label: "curl", code: taskDocs.feedbackCurl }]}
        responseExample={{
          feedback: [{ id: "01J…", taskId: "01J…", body: "Please verify docs.", subtasks: [] }],
        }}
      />

      <SectionHeading
        title="Documents"
        subtitle="Capabilities choose the operations; each token's Document access section chooses the visible roots. A global-folder grant includes that folder and every descendant. Unselected paths are omitted from list and search results and behave as missing on direct access. Scope and owner filters only narrow access."
      />

      <EndpointBlock
        method="GET"
        path="/api/public/v1/documents"
        scope="List documents"
        description="List metadata from authorized private roots and global folders, including every descendant of a granted folder. Hidden documents are excluded from totals and pagination. Optional scope, owner, query, limit, and offset parameters only narrow the result. MCP tool: list_documents."
        snippets={[{ label: "curl", code: documentDocs.listCurl }]}
        responseExample={{
          documents: [
            {
              scope: "global",
              ownerSlug: null,
              relativePath: "design/overview.md",
              title: "Overview",
              description: null,
              author: null,
            },
          ],
          totalMatches: 1,
          nextOffset: null,
        }}
      />

      <EndpointBlock
        method="GET"
        path="/api/public/v1/documents/search"
        scope="Search documents"
        description="Search metadata and markdown content only inside authorized roots and recursive global-folder grants. Results contain bounded line-numbered excerpts and reveal nothing from hidden folders. MCP tool: search_documents."
        snippets={[{ label: "curl", code: documentDocs.searchCurl }]}
        responseExample={{
          documents: [
            {
              scope: "global",
              ownerSlug: null,
              relativePath: "release/notes.md",
              title: "Release notes",
              description: null,
              author: null,
              matches: [
                { kind: "content", field: "content", lineNumber: 4, excerpt: "Deploy Friday." },
              ],
            },
          ],
          totalMatches: 1,
          nextOffset: null,
        }}
      />

      <EndpointBlock
        method="GET"
        path="/api/public/v1/documents/read"
        scope="Read document"
        description="Read one authorized document by scope and path. A global path outside the token's recursive folder grants returns the same not-found response as a missing document. Private reads also require the current specialist slug in owner. MCP tool: read_document."
        snippets={[{ label: "curl", code: documentDocs.readCurl }]}
        responseExample={{
          scope: "private",
          ownerSlug: "writer",
          relativePath: "notes/research.md",
          title: "Research",
          description: null,
          author: "writer",
          content: "# Research",
          revision: { mtimeMs: 1_725_000_000_000, sizeBytes: 10 },
          createdAt: 1_725_000_000_000,
          updatedAt: 1_725_000_100_000,
        }}
      />

      <EndpointBlock
        method="POST"
        path="/api/public/v1/documents"
        scope="Create document"
        description="Create a new markdown document inside an authorized root or recursive global-folder grant. Destinations outside the grant return not found. The path must live in at least one subfolder and end with .md or .markdown; private writes require the owning specialist slug in owner. MCP tool: create_document."
        snippets={[{ label: "curl", code: documentDocs.createCurl }]}
        responseExample={{
          scope: "global",
          ownerSlug: null,
          relativePath: "notes/new-brief.md",
          title: "New brief",
          description: null,
          author: null,
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
          Permission: {props.scope}
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
    <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-app-bg">
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
