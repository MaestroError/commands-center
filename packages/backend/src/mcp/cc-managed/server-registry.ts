import type { AnySchema } from "@modelcontextprotocol/sdk/server/zod-compat";

import type { AppDb } from "../../db/client.js";
import type { RuntimeConfig } from "../../lib/runtime-config.js";
import type { ConversationService } from "../../services/conversation-service.js";
import type { SessionArchiveService } from "../../services/session-archive-service.js";
import type { SessionArchiveSettingsService } from "../../services/session-archive-settings-service.js";
import type { CustomToolActionService } from "../../services/custom-tool-action-service.js";
import type { CustomToolService } from "../../services/custom-tool-service.js";
import type { SpecialistService } from "../../services/specialist-service.js";
import type { LiveRequestService } from "../../services/live-request-service.js";
import type { OpenCodeService } from "../../services/opencode-service.js";
import type { ActivityService } from "../../services/activity-service.js";
import type { SecretService } from "../../services/secret-service.js";
import type { TaskExecutionService } from "../../services/task-execution-service.js";
import type { TaskService } from "../../services/task-service.js";
import type { OpenCodeOrchestrator } from "../../orchestrator/opencode-orchestrator.js";
import {
  createRequestSecretDefinition,
  requestSecretToolMetadata,
} from "./groups/cc-default/tools/request-secret.js";
import {
  createShowFileToUserDefinition,
  showFileToUserToolMetadata,
} from "./groups/cc-default/tools/show-file-to-user.js";
import {
  addTaskArtifactToolMetadata,
  createTaskRunOutcomeToolDefinitions,
  markNeedsHumanReviewToolMetadata,
  setTaskResultToolMetadata,
} from "./groups/cc-default/tools/task-run-outcome-tools.js";
import {
  appendSelfTaskContextToolMetadata,
  createSelfTaskArtifactToolDefinitions,
  createSelfTaskContextToolDefinitions,
  createSelfTaskToolDefinitions,
  createSelfTaskToolMetadata,
  getSelfTaskRunToolMetadata,
  getSelfTaskToolMetadata,
  listSelfTaskArtifactsToolMetadata,
  listSelfTaskRunArtifactsToolMetadata,
  listSelfTaskRunsToolMetadata,
  listSelfTasksToolMetadata,
  readSelfTaskContextToolMetadata,
  scheduleSelfTaskToolMetadata,
} from "./groups/cc-default/tools/self-task-tools.js";
import {
  createSelfTaskLiveToolDefinitions,
  draftSelfTaskTemplateToolMetadata,
  draftSelfTaskToolMetadata,
  draftSelfTaskUpdateToolMetadata,
  runSelfTaskToolMetadata,
} from "./groups/cc-default/tools/self-task-live-tools.js";
import {
  createSelfTaskTemplateToolDefinitions,
  createSelfTaskTemplateToolMetadata,
  createSelfTaskFromTemplateToolMetadata,
  disableSelfTaskTemplateToolMetadata,
  enableSelfTaskTemplateToolMetadata,
  getSelfTaskTemplateToolMetadata,
  listSelfTaskTemplatesToolMetadata,
  runSelfTaskTemplateNowToolMetadata,
} from "./groups/cc-default/tools/self-task-template-tools.js";
import {
  createSelfConversationToolDefinitions,
  getSelfConversationToolMetadata,
  listSelfConversationsToolMetadata,
} from "./groups/cc-default/tools/self-conversation-tools.js";
import { createCopyCustomToolToSpecialistDefinition } from "./groups/cc-tool-management/tools/copy-custom-tool-to-specialist.js";
import { copyCustomToolToSpecialistMetadata } from "./groups/cc-tool-management/tools/copy-custom-tool-to-specialist.js";
import {
  createCustomToolMetadata,
  createCreateCustomToolDefinition,
} from "./groups/cc-tool-management/tools/create-custom-tool.js";
import {
  createTaskContextToolDefinitions,
  createTaskLiveToolDefinitions,
  createTaskToolMetadata,
  createTaskFromTemplateToolMetadata,
  createTaskTemplateToolMetadata,
  createTasksManagementToolDefinitions,
  disableTaskTemplateToolMetadata,
  draftTaskToolMetadata,
  draftTaskUpdateToolMetadata,
  enableTaskTemplateToolMetadata,
  getTaskTemplateToolMetadata,
  getTaskRunToolMetadata,
  getTaskToolMetadata,
  listTaskTemplatesToolMetadata,
  queueTaskToolMetadata,
  appendTaskContextToolMetadata,
  readTaskContextToolMetadata,
  runTaskTemplateNowToolMetadata,
  scheduleTaskToolMetadata,
  updateTaskToolMetadata,
  updateTaskTemplateToolMetadata,
  listTaskRunsToolMetadata,
  listTasksToolMetadata,
} from "./groups/cc-tasks-management/tools/task-management-tools.js";
import {
  createGetSelfProfileToolDefinition,
  createSpecialistLiveToolDefinitions,
  createSpecialistManagementToolDefinitions,
  createSpecialistToolMetadata,
  createListSpecialistsToolDefinition,
  draftSpecialistToolMetadata,
  draftSpecialistUpdateToolMetadata,
  getSelfProfileToolMetadata,
  listSpecialistsToolMetadata,
  listModelsToolMetadata,
  readSpecialistProfileToolMetadata,
  removeSpecialistToolMetadata,
  updateSpecialistToolMetadata,
} from "./groups/cc-specialist-management/tools/specialist-management-tools.js";

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
  // Explicit per-group MCP tool-call timeout in milliseconds. When unset, the
  // client falls back to the long interactive timeout for interactive groups and
  // to opencode's own default for everything else.
  toolCallTimeoutMs?: number;
  catalogTools: readonly CcManagedToolMetadata[];
  tools: readonly CcManagedToolDefinition[];
};

export function createCcManagedMcpServerRegistry(options: {
  db?: AppDb;
  config?: RuntimeConfig;
  opencodeService?: OpenCodeService;
  agentService?: SpecialistService;
  customToolService: CustomToolService;
  customToolActionService?: CustomToolActionService;
  conversationService?: ConversationService;
  liveRequestService?: LiveRequestService;
  secretService?: SecretService;
  orchestrator?: OpenCodeOrchestrator;
  activityService?: ActivityService;
  taskService?: TaskService;
  taskExecutionService?: TaskExecutionService;
  sessionArchiveService?: SessionArchiveService;
  sessionArchiveSettingsService?: SessionArchiveSettingsService;
}): readonly CcManagedMcpServerDefinition[] {
  const ccAppTools: CcManagedToolDefinition[] = [];

  // cc_app holds the operator-interactive tools (live requests) plus the custom-tool
  // authoring helpers. Only cc_app needs the long timeout.
  ccAppTools.push(
    createCreateCustomToolDefinition({ customToolService: options.customToolService }),
  );

  if (options.customToolActionService) {
    ccAppTools.push(
      createCopyCustomToolToSpecialistDefinition({
        customToolActionService: options.customToolActionService,
        conversationService: options.conversationService,
        liveRequestService: options.liveRequestService,
      }),
    );
  }

  if (options.agentService) {
    ccAppTools.push(
      ...createSpecialistLiveToolDefinitions({
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
        ]
      : [];
  const specialistManagementTools: CcManagedToolDefinition[] = options.agentService
    ? [
        ...createSpecialistManagementToolDefinitions({
          agentService: options.agentService,
          conversationService: options.conversationService,
          liveRequestService: options.liveRequestService,
        }),
      ]
    : [];
  const defaultInteractiveTools: CcManagedToolDefinition[] = [];

  if (options.db && options.config && options.opencodeService && options.liveRequestService) {
    defaultInteractiveTools.push(
      createShowFileToUserDefinition({
        db: options.db,
        config: options.config,
        opencodeService: options.opencodeService,
        liveRequestService: options.liveRequestService,
      }),
    );
  }

  if (options.db && options.taskService && options.taskExecutionService) {
    defaultInteractiveTools.push(
      ...createSelfTaskLiveToolDefinitions({
        db: options.db,
        taskService: options.taskService,
        taskExecutionService: options.taskExecutionService,
        conversationService: options.conversationService,
        liveRequestService: options.liveRequestService,
      }),
    );
  }

  const defaultTools: CcManagedToolDefinition[] = [
    ...(options.secretService && options.activityService
      ? [
          createRequestSecretDefinition({
            secretService: options.secretService,
            activityService: options.activityService,
          }),
        ]
      : []),
    ...(options.agentService
      ? [
          createListSpecialistsToolDefinition({ agentService: options.agentService }),
          createGetSelfProfileToolDefinition({ agentService: options.agentService }),
        ]
      : []),
    ...(options.db && options.taskService
      ? [
          ...createTaskRunOutcomeToolDefinitions({
            db: options.db,
            taskService: options.taskService,
          }),
          ...createTaskContextToolDefinitions({ taskService: options.taskService }),
          ...createSelfTaskContextToolDefinitions({
            db: options.db,
            taskService: options.taskService,
          }),
          ...createSelfTaskArtifactToolDefinitions({
            db: options.db,
            taskService: options.taskService,
          }),
        ]
      : []),
    ...(options.db && options.taskService && options.taskExecutionService
      ? [
          ...createSelfTaskToolDefinitions({
            db: options.db,
            taskService: options.taskService,
          }),
          ...createSelfTaskTemplateToolDefinitions({
            db: options.db,
            taskService: options.taskService,
            taskExecutionService: options.taskExecutionService,
          }),
        ]
      : []),
    ...(options.db && options.conversationService
      ? createSelfConversationToolDefinitions({
          db: options.db,
          conversationService: options.conversationService,
          archiveService: options.sessionArchiveService,
          archiveSettingsService: options.sessionArchiveSettingsService,
        })
      : []),
  ];

  return [
    {
      name: "cc_default",
      routeSegment: "cc-default",
      description: "CommandsCenter default tools available to every specialist.",
      enabledByDefault: true,
      systemManaged: true,
      // Quick request/response tools only. Without an explicit timeout these would
      // fall back to the MCP SDK's 60s default; 15s makes these DB-backed tools fail
      // fast while leaving headroom — far below the 10-min interactive window.
      toolCallTimeoutMs: 15 * 1000,
      catalogTools: [
        requestSecretToolMetadata,
        listSpecialistsToolMetadata,
        getSelfProfileToolMetadata,
        setTaskResultToolMetadata,
        addTaskArtifactToolMetadata,
        markNeedsHumanReviewToolMetadata,
        readTaskContextToolMetadata,
        appendTaskContextToolMetadata,
        createSelfTaskToolMetadata,
        scheduleSelfTaskToolMetadata,
        listSelfTasksToolMetadata,
        getSelfTaskToolMetadata,
        listSelfTaskRunsToolMetadata,
        getSelfTaskRunToolMetadata,
        readSelfTaskContextToolMetadata,
        appendSelfTaskContextToolMetadata,
        listSelfTaskTemplatesToolMetadata,
        getSelfTaskTemplateToolMetadata,
        createSelfTaskTemplateToolMetadata,
        runSelfTaskTemplateNowToolMetadata,
        createSelfTaskFromTemplateToolMetadata,
        enableSelfTaskTemplateToolMetadata,
        disableSelfTaskTemplateToolMetadata,
        listSelfTaskArtifactsToolMetadata,
        listSelfTaskRunArtifactsToolMetadata,
        listSelfConversationsToolMetadata,
        getSelfConversationToolMetadata,
      ],
      tools: defaultTools,
    },
    {
      name: "cc_default_interactive",
      routeSegment: "cc-default-interactive",
      description:
        "CommandsCenter interactive self tools for operator-confirmed task creation and updates. Enabled by default; tools pause execution while the operator reviews a form.",
      enabledByDefault: true,
      systemManaged: true,
      interactive: true,
      toolCallTimeoutMs: 10 * 60 * 1000,
      catalogTools: [
        showFileToUserToolMetadata,
        runSelfTaskToolMetadata,
        draftSelfTaskToolMetadata,
        draftSelfTaskUpdateToolMetadata,
        draftSelfTaskTemplateToolMetadata,
      ],
      tools: defaultInteractiveTools,
    },
    {
      name: "cc_app",
      routeSegment: "cc-app",
      description:
        "CommandsCenter app-managed, operator-interactive capabilities for this specialist.",
      enabledByDefault: false,
      interactive: true,
      catalogTools: [
        createCustomToolMetadata,
        copyCustomToolToSpecialistMetadata,
        draftSpecialistToolMetadata,
        draftSpecialistUpdateToolMetadata,
        removeSpecialistToolMetadata,
        draftTaskToolMetadata,
        draftTaskUpdateToolMetadata,
      ],
      tools: ccAppTools,
    },
    {
      name: "cc_specialist_management",
      routeSegment: "cc-specialist-management",
      description: "CommandsCenter specialist creation and update.",
      enabledByDefault: false,
      catalogTools: [
        readSpecialistProfileToolMetadata,
        listModelsToolMetadata,
        createSpecialistToolMetadata,
        updateSpecialistToolMetadata,
      ],
      tools: specialistManagementTools,
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
        listTaskTemplatesToolMetadata,
        getTaskTemplateToolMetadata,
        updateTaskTemplateToolMetadata,
        runTaskTemplateNowToolMetadata,
        createTaskFromTemplateToolMetadata,
        enableTaskTemplateToolMetadata,
        disableTaskTemplateToolMetadata,
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
