import { z } from "zod";
import type { CcManagedToolDefinition, CcManagedToolContext } from "../../../server-registry.js";
import {
  teamAssignmentInputSchema,
  type createTeamService,
} from "../../../../../services/team-service.js";

export const teamToolMetadata = [
  {
    name: "list_teammates",
    description: "List specialists this task owner may delegate to, with public specialties.",
  },
  {
    name: "delegate_assignment",
    description:
      "Delegate a bounded assignment to a permitted specialist. Returns promptly. Workers retain their own instructions and permissions. Register input artifacts first; share only selected IDs. After delegating, continue useful work or end your turn. CC automatically delivers worker results into this same session when your specialist is available.",
  },
  {
    name: "list_team_assignments",
    description:
      "Read this goal execution's assignments, results, artifacts and owner acceptance state.",
  },
  {
    name: "accept_team_assignment",
    description:
      "Record owner acceptance of a returned assignment, or acknowledge a failed/cancelled assignment you have explicitly resolved in your plan. All assignments must be resolved before the main goal can finish.",
  },
  {
    name: "revise_team_assignment",
    description:
      "Request a revision in the worker's existing session. At most three revisions per assignment. Wait for its next result automatically.",
  },
  {
    name: "read_team_artifact",
    description:
      "Read an artifact shared with this task session. Returns text where supported and a local snapshot path for file-consuming tools. Does not expose a public URL or another specialist's private directory.",
  },
].map((tool) => ({ ...tool, context: "task_run" as const }));

export function createTeamToolDefinitions(
  teams: ReturnType<typeof createTeamService>,
): CcManagedToolDefinition[] {
  const idSchema = z.object({ assignmentId: z.string().min(1) });
  const schemas = [
    z.object({}),
    teamAssignmentInputSchema,
    z.object({}),
    idSchema,
    idSchema.extend({ instructions: z.string().trim().min(1).max(20000) }),
    z.object({ artifactId: z.string().min(1) }),
  ];
  function caller(context: CcManagedToolContext): string {
    if (context.caller?.context !== "task_run")
      throw new Error("Teams tools require a trusted native task caller.");
    return context.caller.taskRunId;
  }
  return teamToolMetadata.map((tool, index) => ({
    ...tool,
    inputSchema: schemas[index],
    async execute(input, context) {
      const runId = caller(context);
      let result: unknown;
      switch (tool.name) {
        case "list_teammates":
          result = await teams.collaborators(runId);
          break;
        case "delegate_assignment": {
          if (!context.callID || !context.messageID)
            throw new Error("Delegation requires a stable tool-call identity.");
          result = await teams.delegate(runId, input, `${context.messageID}:${context.callID}`);
          break;
        }
        case "list_team_assignments":
          result = await teams.list(runId);
          break;
        case "accept_team_assignment":
          result = await teams.accept(runId, idSchema.parse(input).assignmentId);
          break;
        case "revise_team_assignment": {
          if (!context.callID || !context.messageID)
            throw new Error("Revision requires a stable tool-call identity.");
          const parsed = idSchema
            .extend({ instructions: z.string().trim().min(1).max(20000) })
            .parse(input);
          result = await teams.revise(
            runId,
            parsed.assignmentId,
            parsed.instructions,
            `${context.messageID}:${context.callID}`,
          );
          break;
        }
        case "read_team_artifact":
          result = await teams.readArtifact(
            runId,
            z.object({ artifactId: z.string() }).parse(input).artifactId,
          );
          break;
      }
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  }));
}
