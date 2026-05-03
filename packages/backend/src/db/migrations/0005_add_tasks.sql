CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`context` text NOT NULL,
	`todos_json` text NOT NULL,
	`status` text NOT NULL,
	`trigger_mode` text NOT NULL,
	`schedule_json` text NOT NULL,
	`permission_profile_json` text,
	`enabled` integer NOT NULL,
	`archived` integer NOT NULL,
	`latest_result_summary` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`archived_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tasks_agent_id_idx` ON `tasks` (`agent_id`);
--> statement-breakpoint
CREATE INDEX `tasks_status_idx` ON `tasks` (`status`);
--> statement-breakpoint
CREATE INDEX `tasks_trigger_mode_idx` ON `tasks` (`trigger_mode`);
--> statement-breakpoint
CREATE INDEX `tasks_archived_idx` ON `tasks` (`archived`);
--> statement-breakpoint
CREATE INDEX `tasks_deleted_at_idx` ON `tasks` (`deleted_at`);
--> statement-breakpoint
CREATE TABLE `task_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`opencode_session_id` text,
	`status` text NOT NULL,
	`trigger_source` text NOT NULL,
	`rendered_prompt` text NOT NULL,
	`rendered_context_json` text,
	`effective_permissions_json` text,
	`result_summary` text,
	`result_json` text,
	`error_message` text,
	`error_details_json` text,
	`started_at` integer,
	`completed_at` integer,
	`cancelled_at` integer,
	`cancellation_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `task_runs_task_id_idx` ON `task_runs` (`task_id`);
--> statement-breakpoint
CREATE INDEX `task_runs_agent_id_idx` ON `task_runs` (`agent_id`);
--> statement-breakpoint
CREATE INDEX `task_runs_status_idx` ON `task_runs` (`status`);
--> statement-breakpoint
CREATE INDEX `task_runs_created_at_idx` ON `task_runs` (`created_at`);
