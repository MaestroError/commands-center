/**
 * Single source of truth for the public-API integration snippets shown on the
 * template card, the template details "Docs" tab, and the API "Endpoints" tab.
 *
 * Keeping this in `@cc/shared` guarantees the three surfaces never drift apart.
 * A real token is never interpolated — always the `<YOUR_API_TOKEN>` placeholder,
 * since tokens are only shown once at creation time (Epic 07).
 */

export const PUBLIC_API_TOKEN_PLACEHOLDER = "<YOUR_API_TOKEN>";

export interface BuildTemplateEndpointDocsInput {
  template: { id: string; title: string; description?: string };
  /** Resolved from the current origin on the client (no trailing slash). */
  baseUrl: string;
}

export interface TemplateEndpointDocs {
  /** Base API URL the snippets target, e.g. `https://host/api/public/v1`. */
  apiBaseUrl: string;
  /** Ready-to-run curl that triggers the template immediately. */
  triggerCurl: string;
  /** `fetch()` snippet that triggers the template immediately. */
  triggerJs: string;
  /** curl variant that schedules the template for a future time. */
  scheduleCurl: string;
  /** curl that polls a run's status. */
  pollCurl: string;
  /** Self-contained, AI-agent-ready markdown integration guide. */
  agentInstructions: string;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function jsonBlock(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function buildTemplateEndpointDocs(
  input: BuildTemplateEndpointDocsInput,
): TemplateEndpointDocs {
  const apiBaseUrl = `${trimTrailingSlash(input.baseUrl)}/api/public/v1`;
  const { id, title } = input.template;
  const description = input.template.description?.trim() ?? "";
  const triggerUrl = `${apiBaseUrl}/task-templates/${id}/trigger`;
  const authHeader = `Authorization: Bearer ${PUBLIC_API_TOKEN_PLACEHOLDER}`;

  const triggerBody = {
    context: { text: "Optional context passed into the run." },
  };

  const scheduleBody = {
    context: { text: "Optional context passed into the run." },
    schedule: { runAt: "2026-06-10T09:00:00Z", timezone: "Europe/Berlin" },
  };

  const triggerCurl = [
    `curl -X POST '${triggerUrl}' \\`,
    `  -H '${authHeader}' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d '${JSON.stringify(triggerBody)}'`,
  ].join("\n");

  const triggerJs = [
    `await fetch('${triggerUrl}', {`,
    `  method: 'POST',`,
    `  headers: {`,
    `    Authorization: 'Bearer ${PUBLIC_API_TOKEN_PLACEHOLDER}',`,
    `    'Content-Type': 'application/json',`,
    `  },`,
    `  body: JSON.stringify(${jsonBlock(triggerBody)}),`,
    `});`,
  ].join("\n");

  const scheduleCurl = [
    `curl -X POST '${triggerUrl}' \\`,
    `  -H '${authHeader}' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d '${JSON.stringify(scheduleBody)}'`,
  ].join("\n");

  const pollCurl = [`curl '${apiBaseUrl}/task-runs/<RUN_ID>' \\`, `  -H '${authHeader}'`].join(
    "\n",
  );

  const agentInstructions = buildAgentInstructions({
    title,
    description,
    id,
    apiBaseUrl,
    triggerUrl,
    triggerBody,
    scheduleBody,
  });

  return { apiBaseUrl, triggerCurl, triggerJs, scheduleCurl, pollCurl, agentInstructions };
}

export interface TaskApiDocs {
  apiBaseUrl: string;
  specialistsCurl: string;
  createCurl: string;
  listByStatusCurl: string;
  listByTemplateCurl: string;
  getCurl: string;
  getExpandCurl: string;
  enableTemplateCurl: string;
  disableTemplateCurl: string;
  triggerCurl: string;
  scheduleCurl: string;
  runsCurl: string;
  runDetailCurl: string;
  feedbackCurl: string;
}

export interface DocumentApiDocs {
  listCurl: string;
  searchCurl: string;
  readCurl: string;
  createCurl: string;
}

export function buildDocumentApiDocs(baseUrl: string): DocumentApiDocs {
  const apiBaseUrl = `${trimTrailingSlash(baseUrl)}/api/public/v1`;
  const auth = `-H 'Authorization: Bearer ${PUBLIC_API_TOKEN_PLACEHOLDER}'`;

  return {
    listCurl: [`curl '${apiBaseUrl}/documents' \\`, `  ${auth}`].join("\n"),
    searchCurl: [
      `curl '${apiBaseUrl}/documents/search?query=deployment&includeContent=true' \\`,
      `  ${auth}`,
    ].join("\n"),
    readCurl: [
      `curl '${apiBaseUrl}/documents/read?scope=private&owner=writer&path=notes%2Fresearch.md' \\`,
      `  ${auth}`,
    ].join("\n"),
    createCurl: [
      `curl -X POST '${apiBaseUrl}/documents' \\`,
      `  ${auth} \\`,
      `  -H 'Content-Type: application/json' \\`,
      `  -d '{"scope":"global","path":"notes/new-brief.md","title":"New brief","content":"# New brief"}'`,
    ].join("\n"),
  };
}

/**
 * Curl snippets for the Epic 09 direct-task endpoints (the `tasks` scope).
 * Origin-relative only — not tied to a specific task — so the Endpoints tab can
 * document the task surface without a concrete task id. Deterministic for a
 * given `baseUrl` (snapshot-testable).
 */
export function buildTaskApiDocs(baseUrl: string): TaskApiDocs {
  const apiBaseUrl = `${trimTrailingSlash(baseUrl)}/api/public/v1`;
  const auth = `-H 'Authorization: Bearer ${PUBLIC_API_TOKEN_PLACEHOLDER}'`;
  const json = `-H 'Content-Type: application/json'`;

  const createBody = {
    specialistId: "<SPECIALIST_ID>",
    title: "Audit the staging logs",
    description: "Look for 5xx spikes in the last 24h.",
    todos: [{ content: "Pull logs" }, { content: "Summarise anomalies" }],
    context: { text: "Staging only." },
  };

  return {
    apiBaseUrl,
    specialistsCurl: [`curl '${apiBaseUrl}/specialists' \\`, `  ${auth}`].join("\n"),
    createCurl: [
      `curl -X POST '${apiBaseUrl}/tasks' \\`,
      `  ${auth} \\`,
      `  ${json} \\`,
      `  -d '${JSON.stringify(createBody)}'`,
    ].join("\n"),
    listByStatusCurl: [`curl '${apiBaseUrl}/tasks?status=ready_to_check' \\`, `  ${auth}`].join(
      "\n",
    ),
    listByTemplateCurl: [
      `curl '${apiBaseUrl}/tasks?templateId=<TEMPLATE_ID>&status=queued' \\`,
      `  ${auth}`,
    ].join("\n"),
    getCurl: [`curl '${apiBaseUrl}/tasks/<TASK_ID>' \\`, `  ${auth}`].join("\n"),
    getExpandCurl: [
      `curl '${apiBaseUrl}/tasks/<TASK_ID>?expand=runs,feedback' \\`,
      `  ${auth}`,
    ].join("\n"),
    enableTemplateCurl: [
      `curl -X POST '${apiBaseUrl}/task-templates/<TEMPLATE_ID>/enable' \\`,
      `  ${auth}`,
    ].join("\n"),
    disableTemplateCurl: [
      `curl -X POST '${apiBaseUrl}/task-templates/<TEMPLATE_ID>/disable' \\`,
      `  ${auth}`,
    ].join("\n"),
    triggerCurl: [
      `curl -X POST '${apiBaseUrl}/tasks/<TASK_ID>/trigger' \\`,
      `  ${auth} \\`,
      `  ${json} \\`,
      `  -d '${JSON.stringify({ metadata: { source: "my-agent" } })}'`,
    ].join("\n"),
    scheduleCurl: [
      `curl -X POST '${apiBaseUrl}/tasks/<TASK_ID>/schedule' \\`,
      `  ${auth} \\`,
      `  ${json} \\`,
      `  -d '${JSON.stringify({ runAt: "2026-06-10T09:00:00Z", timezone: "Europe/Berlin" })}'`,
    ].join("\n"),
    runsCurl: [`curl '${apiBaseUrl}/tasks/<TASK_ID>/runs' \\`, `  ${auth}`].join("\n"),
    runDetailCurl: [`curl '${apiBaseUrl}/tasks/<TASK_ID>/runs/<RUN_ID>' \\`, `  ${auth}`].join(
      "\n",
    ),
    feedbackCurl: [`curl '${apiBaseUrl}/tasks/<TASK_ID>/feedback' \\`, `  ${auth}`].join("\n"),
  };
}

function buildAgentInstructions(input: {
  title: string;
  description: string;
  id: string;
  apiBaseUrl: string;
  triggerUrl: string;
  triggerBody: unknown;
  scheduleBody: unknown;
}): string {
  const descriptionLine = input.description ? input.description : "_No description provided._";

  return [
    `# Trigger the "${input.title}" task`,
    "",
    descriptionLine,
    "",
    "You can run this task template over an HTTP API. Authenticate every request",
    `with a bearer token in the \`Authorization\` header. Replace \`${PUBLIC_API_TOKEN_PLACEHOLDER}\``,
    "with a token issued from the CommandsCenter API page.",
    "",
    "## Trigger now",
    "",
    `\`POST ${input.triggerUrl}\``,
    "",
    "Headers:",
    "",
    "```",
    `Authorization: Bearer ${PUBLIC_API_TOKEN_PLACEHOLDER}`,
    "Content-Type: application/json",
    "```",
    "",
    "Body (all fields optional):",
    "",
    "```json",
    jsonBlock({
      context: { text: "Free-form context passed into the run." },
      attachments: [
        {
          filename: "data.csv",
          mimeType: "text/csv",
          dataUrl: "data:text/csv;base64,...",
          sizeBytes: 20480,
        },
      ],
      schedule: { runAt: "2026-06-10T09:00:00Z", timezone: "Europe/Berlin" },
      metadata: { source: "my-agent" },
    }),
    "```",
    "",
    "- Omit `schedule` to run immediately. The response includes a `runId` you can poll.",
    "- Include `schedule.runAt` (ISO-8601, must be in the future) to schedule a single run.",
    '  The response has `status: "scheduled"` and `runId: null` until the run starts.',
    "- `attachments` are inline base64 data URLs, capped at 10 MB each.",
    "",
    "Example immediate trigger:",
    "",
    "```json",
    jsonBlock(input.triggerBody),
    "```",
    "",
    "Response:",
    "",
    "```json",
    jsonBlock({ taskId: "01J...", runId: "01J...", status: "queued", scheduledFor: null }),
    "```",
    "",
    "## Poll the run",
    "",
    `\`GET ${input.apiBaseUrl}/task-runs/<RUN_ID>\``,
    "",
    "Repeat until `status` is `completed`, `failed`, `cancelled`, or `skipped`.",
    "",
    "```json",
    jsonBlock({
      runId: "01J...",
      taskId: "01J...",
      status: "completed",
      outcome: "success",
      finalMessage: "Report generated.",
      startedAt: "2026-06-02T10:00:00Z",
      completedAt: "2026-06-02T10:02:30Z",
    }),
    "```",
  ].join("\n");
}
