import type { AnySchema } from "@modelcontextprotocol/sdk/server/zod-compat";

import type { AppDb } from "../../db/client.js";
import type { RuntimeConfig } from "../../lib/runtime-config.js";
import type { ConversationService } from "../../services/conversation-service.js";
import type { CustomToolActionService } from "../../services/custom-tool-action-service.js";
import type { CustomToolService } from "../../services/custom-tool-service.js";
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
  createTaskToolMetadata,
  createTaskTemplateToolMetadata,
  createTasksManagementToolDefinitions,
  getTaskRunToolMetadata,
  getTaskToolMetadata,
  queueTaskToolMetadata,
  appendTaskContextToolMetadata,
  readTaskContextToolMetadata,
  runTaskTemplateNowToolMetadata,
  scheduleTaskToolMetadata,
  updateTaskContextToolMetadata,
  listTaskRunsToolMetadata,
  listTasksToolMetadata,
} from "./groups/cc-tasks-management/tools/task-management-tools.js";

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
  catalogTools: readonly CcManagedToolMetadata[];
  tools: readonly CcManagedToolDefinition[];
};

export function createCcManagedMcpServerRegistry(options: {
  db?: AppDb;
  config?: RuntimeConfig;
  opencodeService?: OpenCodeService;
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

  const toolManagementTools: CcManagedToolDefinition[] = [
    createCreateCustomToolDefinition({ customToolService: options.customToolService }),
  ];

  if (options.customToolActionService) {
    toolManagementTools.push(
      createCopyCustomToolToAgentDefinition({
        customToolActionService: options.customToolActionService,
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
        ]
      : [];
  const taskRunOutcomeTools: CcManagedToolDefinition[] =
    options.db && options.taskService
      ? [
          ...createTaskRunOutcomeToolDefinitions({
            db: options.db,
            taskService: options.taskService,
          }),
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
      ],
      tools: taskRunOutcomeTools,
    },
    {
      name: "cc_app",
      routeSegment: "cc-app",
      description: "CommandsCenter app-managed capabilities for this agent.",
      enabledByDefault: false,
      catalogTools: [addSecretToolMetadata, showFileToUserToolMetadata],
      tools: ccAppTools,
    },
    {
      name: "cc_tool_management",
      routeSegment: "cc-tool-management",
      description: "CommandsCenter-managed tool creation and library maintenance for this agent.",
      enabledByDefault: false,
      catalogTools: [createCustomToolMetadata, copyCustomToolToAgentMetadata],
      tools: toolManagementTools,
    },
    {
      name: "cc_tasks_management",
      routeSegment: "cc-tasks-management",
      description: "CommandsCenter task creation, scheduling, triggering, and run inspection.",
      enabledByDefault: false,
      catalogTools: [
        createTaskToolMetadata,
        listTasksToolMetadata,
        getTaskToolMetadata,
        queueTaskToolMetadata,
        scheduleTaskToolMetadata,
        listTaskRunsToolMetadata,
        getTaskRunToolMetadata,
        createTaskTemplateToolMetadata,
        runTaskTemplateNowToolMetadata,
        readTaskContextToolMetadata,
        appendTaskContextToolMetadata,
        updateTaskContextToolMetadata,
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
