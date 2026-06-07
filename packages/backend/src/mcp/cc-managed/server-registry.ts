import type { AnySchema } from "@modelcontextprotocol/sdk/server/zod-compat";

import type { AppDb } from "../../db/client.js";
import type { RuntimeConfig } from "../../lib/runtime-config.js";
import type { ConversationService } from "../../services/conversation-service.js";
import type { CustomToolActionService } from "../../services/custom-tool-action-service.js";
import type { CustomToolService } from "../../services/custom-tool-service.js";
import type { AgentService } from "../../services/agent-service.js";
import type { LiveRequestService } from "../../services/live-request-service.js";
import type { OpenCodeService } from "../../services/opencode-service.js";
import type { SecretService } from "../../services/secret-service.js";
import type { TaskExecutionService } from "../../services/task-execution-service.js";
import type { TaskService } from "../../services/task-service.js";
import type { OpenCodeOrchestrator } from "../../orchestrator/opencode-orchestrator.js";
import {
  addSecretToolMetadata,
  createAddSecretDefinition,
} from "./groups/cc-app/tools/add-secret.js";
import {
  createShowFileToUserDefinition,
  showFileToUserToolMetadata,
} from "./groups/cc-app/tools/show-file-to-user.js";
import {
  addTaskArtifactToolMetadata,
  createTaskRunOutcomeToolDefinitions,
  markNeedsHumanReviewToolMetadata,
  setTaskResultToolMetadata,
} from "./groups/cc-default/tools/task-run-outcome-tools.js";
import { createCopyCustomToolToAgentDefinition } from "./groups/cc-tool-management/tools/copy-custom-tool-to-agent.js";
import { copyCustomToolToAgentMetadata } from "./groups/cc-tool-management/tools/copy-custom-tool-to-agent.js";
import {
  createCustomToolMetadata,
  createCreateCustomToolDefinition,
} from "./groups/cc-tool-management/tools/create-custom-tool.js";
import {
  createTaskContextToolDefinitions,
  createTaskLiveToolDefinitions,
  createTaskToolMetadata,
  createTaskTemplateToolMetadata,
  createTasksManagementToolDefinitions,
  draftTaskToolMetadata,
  draftTaskUpdateToolMetadata,
  getTaskRunToolMetadata,
  getTaskToolMetadata,
  queueTaskToolMetadata,
  appendTaskContextToolMetadata,
  readTaskContextToolMetadata,
  runTaskTemplateNowToolMetadata,
  scheduleTaskToolMetadata,
  updateTaskToolMetadata,
  listTaskRunsToolMetadata,
  listTasksToolMetadata,
} from "./groups/cc-tasks-management/tools/task-management-tools.js";
import {
  createAgentLiveToolDefinitions,
  createAgentManagementToolDefinitions,
  createAgentToolMetadata,
  createListAgentsToolDefinition,
  draftAgentToolMetadata,
  draftAgentUpdateToolMetadata,
  listAgentsToolMetadata,
  listModelsToolMetadata,
  removeAgentToolMetadata,
  updateAgentToolMetadata,
} from "./groups/cc-agent-management/tools/agent-management-tools.js";

export type CcManagedToolContext = {
  agentSlug: string;
};

export type CcManagedToolDefinition = {
  name: string;
  description: string;
  context: CcManagedToolContextMode;
  inputSchema?: AnySchema;
  outputSchema?: AnySchema;
  execute: (
    args: unknown,
    context: CcManagedToolContext,
  ) =>
    | {
        content: Array<{ type: "text"; text: string }>;
        structuredContent?: Record<string, unknown>;
        isError?: boolean;
      }
    | Promise<{
        content: Array<{ type: "text"; text: string }>;
        structuredContent?: Record<string, unknown>;
        isError?: boolean;
      }>;
};

export type CcManagedToolMetadata = {
  name: string;
  description: string;
  context: CcManagedToolContextMode;
};

export type CcManagedToolContextMode = "chat" | "task_run" | "both";

export type CcManagedMcpServerDefinition = {
  name: string;
  routeSegment: string;
  description: string;
  enabledByDefault: boolean;
  systemManaged?: boolean;
  // True when the group contains human-in-the-loop tools that block while waiting
  // for the operator (secrets, file preview, draft reviews, confirmations). These
  // need a much longer MCP client timeout than quick request/response tools.
  interactive?: boolean;
  catalogTools: readonly CcManagedToolMetadata[];
  tools: readonly CcManagedToolDefinition[];
};

export function createCcManagedMcpServerRegistry(options: {
  db?: AppDb;
  config?: RuntimeConfig;
  opencodeService?: OpenCodeService;
  agentService?: AgentService;
  customToolService: CustomToolService;
  customToolActionService?: CustomToolActionService;
  conversationService?: ConversationService;
  liveRequestService?: LiveRequestService;
  secretService?: SecretService;
  orchestrator?: OpenCodeOrchestrator;
  taskService?: TaskService;
  taskExecutionService?: TaskExecutionService;
}): readonly CcManagedMcpServerDefinition[] {
  const ccAppTools: CcManagedToolDefinition[] = [];

  if (options.db && options.config && options.opencodeService && options.liveRequestService) {
    ccAppTools.push(
      createShowFileToUserDefinition({
        db: options.db,
        config: options.config,
        opencodeService: options.opencodeService,
        liveRequestService: options.liveRequestService,
      }),
    );

    if (options.secretService && options.orchestrator) {
      ccAppTools.unshift(
        createAddSecretDefinition({
          db: options.db,
          config: options.config,
          opencodeService: options.opencodeService,
          liveRequestService: options.liveRequestService,
          secretService: options.secretService,
          orchestrator: options.orchestrator,
        }),
      );
    }
  }

  // cc_app holds the operator-interactive tools (live requests) plus the custom-tool
  // authoring helpers and a quick agent listing. Only cc_app needs the long timeout.
  ccAppTools.push(
    createCreateCustomToolDefinition({ customToolService: options.customToolService }),
  );

  if (options.agentService) {
    ccAppTools.push(createListAgentsToolDefinition({ agentService: options.agentService }));
  }

  if (options.customToolActionService) {
    ccAppTools.push(
      createCopyCustomToolToAgentDefinition({
        customToolActionService: options.customToolActionService,
        conversationService: options.conversationService,
        liveRequestService: options.liveRequestService,
      }),
    );
  }

  if (options.agentService) {
    ccAppTools.push(
      ...createAgentLiveToolDefinitions({
        agentService: options.agentService,
        conversationService: options.conversationService,
        liveRequestService: options.liveRequestService,
      }),
    );
  }

  if (options.db && options.taskService && options.taskExecutionService) {
    ccAppTools.push(
      ...createTaskLiveToolDefinitions({
        db: options.db,
        taskService: options.taskService,
        taskExecutionService: options.taskExecutionService,
        conversationService: options.conversationService,
        liveRequestService: options.liveRequestService,
      }),
    );
  }

  const taskManagementTools: CcManagedToolDefinition[] =
    options.db && options.taskService && options.taskExecutionService
      ? [
          ...createTasksManagementToolDefinitions({
            db: options.db,
            taskService: options.taskService,
            taskExecutionService: options.taskExecutionService,
            conversationService: options.conversationService,
            liveRequestService: options.liveRequestService,
          }),
          ...(options.agentService
            ? [createListAgentsToolDefinition({ agentService: options.agentService })]
            : []),
        ]
      : [];
  const agentManagementTools: CcManagedToolDefinition[] = options.agentService
    ? [
        ...createAgentManagementToolDefinitions({
          agentService: options.agentService,
          conversationService: options.conversationService,
          liveRequestService: options.liveRequestService,
        }),
      ]
    : [];
  const taskRunOutcomeTools: CcManagedToolDefinition[] =
    options.db && options.taskService
      ? [
          ...createTaskRunOutcomeToolDefinitions({
            db: options.db,
            taskService: options.taskService,
          }),
          ...createTaskContextToolDefinitions({ taskService: options.taskService }),
        ]
      : [];

  return [
    {
      name: "cc_default",
      routeSegment: "cc-default",
      description: "CommandsCenter default task-run outcome reporting tools.",
      enabledByDefault: true,
      systemManaged: true,
      catalogTools: [
        setTaskResultToolMetadata,
        addTaskArtifactToolMetadata,
        markNeedsHumanReviewToolMetadata,
        readTaskContextToolMetadata,
        appendTaskContextToolMetadata,
      ],
      tools: taskRunOutcomeTools,
    },
    {
      name: "cc_app",
      routeSegment: "cc-app",
      description: "CommandsCenter app-managed, operator-interactive capabilities for this agent.",
      enabledByDefault: false,
      interactive: true,
      catalogTools: [
        addSecretToolMetadata,
        showFileToUserToolMetadata,
        createCustomToolMetadata,
        listAgentsToolMetadata,
        copyCustomToolToAgentMetadata,
        draftAgentToolMetadata,
        draftAgentUpdateToolMetadata,
        removeAgentToolMetadata,
        draftTaskToolMetadata,
        draftTaskUpdateToolMetadata,
      ],
      tools: ccAppTools,
    },
    {
      name: "cc_agent_management",
      routeSegment: "cc-agent-management",
      description: "CommandsCenter agent listing, creation, and update.",
      enabledByDefault: false,
      catalogTools: [
        listAgentsToolMetadata,
        listModelsToolMetadata,
        createAgentToolMetadata,
        updateAgentToolMetadata,
      ],
      tools: agentManagementTools,
    },
    {
      name: "cc_tasks_management",
      routeSegment: "cc-tasks-management",
      description: "CommandsCenter task creation, scheduling, triggering, and run inspection.",
      enabledByDefault: false,
      catalogTools: [
        createTaskToolMetadata,
        updateTaskToolMetadata,
        listTasksToolMetadata,
        getTaskToolMetadata,
        queueTaskToolMetadata,
        scheduleTaskToolMetadata,
        listTaskRunsToolMetadata,
        getTaskRunToolMetadata,
        createTaskTemplateToolMetadata,
        runTaskTemplateNowToolMetadata,
        listAgentsToolMetadata,
      ],
      tools: taskManagementTools,
    },
  ] as const satisfies readonly CcManagedMcpServerDefinition[];
}

export function listCcManagedMcpServers(
  registry: readonly CcManagedMcpServerDefinition[],
): readonly CcManagedMcpServerDefinition[] {
  return registry;
}

export function getCcManagedMcpServer(
  registry: readonly CcManagedMcpServerDefinition[],
  name: string,
): CcManagedMcpServerDefinition | undefined {
  return registry.find((server) => server.name === name);
}

export function getCcManagedMcpServerByRouteSegment(
  registry: readonly CcManagedMcpServerDefinition[],
  routeSegment: string,
): CcManagedMcpServerDefinition | undefined {
  return registry.find((server) => server.routeSegment === routeSegment);
}
