import { BadRequestError, NotFoundError } from "../lib/api-error.js";
import type { ConversationEngine } from "../services/conversation-engine.js";
import type {
  OpenCodePendingPermission,
  OpenCodePendingQuestion,
} from "../services/opencode-service.js";
import type { EmbeddedOpenCodeHost } from "./embedded-host.js";

type Permission = Awaited<
  ReturnType<EmbeddedOpenCodeHost["permission"]["request"]["list"]>
>["data"][number];
type Form = Awaited<ReturnType<EmbeddedOpenCodeHost["form"]["list"]>>["data"][number];

export function mapEmbeddedPermission(permission: Permission): OpenCodePendingPermission {
  return {
    id: permission.id,
    sessionID: permission.sessionID,
    permission: permission.action,
    patterns: permission.resources,
    always: permission.save ?? [],
    metadata: permission.metadata ?? {},
    tool: permission.source
      ? { messageID: permission.source.messageID, callID: permission.source.id }
      : undefined,
  };
}

export function mapEmbeddedQuestion(form: Form): OpenCodePendingQuestion | undefined {
  if (form.metadata?.["kind"] !== "question") return undefined;
  const tool = form.metadata["tool"];
  return {
    id: form.id,
    sessionID: form.sessionID,
    questions: form.fields.map((field) => ({
      header: field.title ?? form.title,
      question: field.description ?? field.title ?? form.title,
      options:
        "options" in field
          ? (field.options?.map((option) => ({
              label: option.label,
              description: option.description ?? "",
            })) ?? [])
          : [],
      multiple: field.type === "multiselect",
    })),
    tool:
      tool &&
      typeof tool === "object" &&
      !Array.isArray(tool) &&
      typeof tool["messageID"] === "string" &&
      typeof tool["id"] === "string"
        ? { messageID: tool["messageID"], callID: tool["id"] }
        : undefined,
  };
}

export function createEmbeddedInteractions(
  host: EmbeddedOpenCodeHost,
): Pick<
  ConversationEngine,
  | "listPendingPermissions"
  | "replyPermission"
  | "listPendingQuestions"
  | "replyQuestion"
  | "rejectQuestion"
> {
  async function findForm(
    directory: string,
    requestId: string,
    signal?: AbortSignal,
  ): Promise<Form> {
    const page = await host.form.list({ location: { directory } }, { signal });
    const form = page.data.find(
      (item) => item.id === requestId && item.metadata?.["kind"] === "question",
    );
    if (!form) throw new NotFoundError(`Pending question "${requestId}" no longer exists.`);
    return form;
  }
  return {
    async listPendingPermissions(directory, signal) {
      const page = await host.permission.request.list({ location: { directory } }, { signal });
      return page.data.map(mapEmbeddedPermission);
    },
    async replyPermission(directory, requestID, decision, signal) {
      const page = await host.permission.request.list({ location: { directory } }, { signal });
      const request = page.data.find((item) => item.id === requestID);
      if (!request) throw new NotFoundError(`Pending permission "${requestID}" no longer exists.`);
      await host.permission.reply(
        { sessionID: request.sessionID, requestID, decision },
        { signal },
      );
    },
    async listPendingQuestions(directory, signal) {
      const page = await host.form.list({ location: { directory } }, { signal });
      return page.data.flatMap((form) => {
        const question = mapEmbeddedQuestion(form);
        return question ? [question] : [];
      });
    },
    async replyQuestion(directory, requestId, answers, signal) {
      const form = await findForm(directory, requestId, signal);
      if (form.fields.length !== answers.length)
        throw new BadRequestError("Answer every question.");
      const answer: Record<string, string | string[]> = {};
      form.fields.forEach((field, index) => {
        const values = answers[index] ?? [];
        const options = "options" in field ? (field.options ?? []) : [];
        const mapped = values.map(
          (value) => options.find((option) => option.label === value)?.value ?? value,
        );
        answer[field.key] = field.type === "multiselect" ? mapped : (mapped[0] ?? "");
      });
      await host.sessions.form.reply(
        { sessionID: form.sessionID, formID: form.id, answer },
        { signal },
      );
    },
    async rejectQuestion(directory, requestId, signal) {
      const form = await findForm(directory, requestId, signal);
      await host.sessions.form.cancel({ sessionID: form.sessionID, formID: form.id }, { signal });
    },
  };
}
