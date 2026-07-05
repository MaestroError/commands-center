// Shared types for the task-execution-service split (issue #99): the DI
// options bag and the accepted-prompt evidence shape used across modules.

import type { ConversationDetail, TaskRun } from "@cc/shared/schemas";
import type { Logger } from "pino";
import type { AppDb } from "../../db/client.js";
import type { OpenCodeOrchestrator } from "../../orchestrator/opencode-orchestrator.js";
import type { ActivityService } from "../activity-service.js";
import type { ConversationService } from "../conversation-service.js";
import type { SessionArchiveService } from "../session-archive-service.js";
import type { SessionArchiveSettingsService } from "../session-archive-settings-service.js";
import type { TaskContextAttachmentService } from "../task-context-attachment-service.js";
import type { TaskRunDeferOptions } from "../task-execution-service.js";
import type { TaskPermissionService } from "../task-permission-service.js";
import type { TaskRunMonitorOptions } from "../task-run-monitor-service.js";
import type { TaskRunMonitorSettingsService } from "../task-run-monitor-settings-service.js";
import type { TaskRunTransportRetryOptions } from "../task-run-support.js";
import type { TaskService } from "../task-service.js";

export interface TaskExecutionServiceOptions {
  db?: AppDb;
  taskService: TaskService;
  conversationService?: ConversationService;
  orchestrator?: Pick<OpenCodeOrchestrator, "getStatus">;
  taskContextAttachmentService?: TaskContextAttachmentService;
  taskPermissionService?: TaskPermissionService;
  archiveService?: SessionArchiveService;
  archiveSettingsService?: SessionArchiveSettingsService;
  monitorSettingsService?: TaskRunMonitorSettingsService;
  activityService?: ActivityService;
  onRunTerminal?: (run: TaskRun) => void | Promise<void>;
  logger?: Logger;
  monitor?: TaskRunMonitorOptions;
  transportRetry?: TaskRunTransportRetryOptions;
  defer?: TaskRunDeferOptions;
}

export type AcceptedPromptEvidence = {
  conversation: ConversationDetail;
  reason: "monitor_metadata" | "messages" | "status";
  statusType?: string;
};
