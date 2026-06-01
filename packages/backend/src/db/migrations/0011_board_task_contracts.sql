CREATE TABLE `task_subtasks` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`default_agent_id` text,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`default_agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `task_subtasks_task_id_idx` ON `task_subtasks` (`task_id`);
--> statement-breakpoint
CREATE INDEX `task_subtasks_default_agent_id_idx` ON `task_subtasks` (`default_agent_id`);
--> statement-breakpoint
CREATE INDEX `task_subtasks_status_idx` ON `task_subtasks` (`status`);
--> statement-breakpoint
CREATE INDEX `task_subtasks_deleted_at_idx` ON `task_subtasks` (`deleted_at`);
--> statement-breakpoint
CREATE TABLE `task_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`body` text NOT NULL,
	`status` text NOT NULL,
	`included_in_run_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`resolved_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `task_comments_task_id_idx` ON `task_comments` (`task_id`);
--> statement-breakpoint
CREATE INDEX `task_comments_status_idx` ON `task_comments` (`status`);
--> statement-breakpoint
CREATE INDEX `task_comments_included_in_run_id_idx` ON `task_comments` (`included_in_run_id`);
--> statement-breakpoint
CREATE INDEX `task_comments_deleted_at_idx` ON `task_comments` (`deleted_at`);
--> statement-breakpoint
ALTER TABLE `task_templates` ADD `default_agent_id` text REFERENCES `agents`(`id`);
--> statement-breakpoint
ALTER TABLE `task_templates` ADD `recurrence_json` text;
--> statement-breakpoint
ALTER TABLE `task_templates` ADD `next_occurrence_at` integer;
--> statement-breakpoint
ALTER TABLE `task_templates` ADD `last_generated_occurrence_at` integer;
--> statement-breakpoint
CREATE INDEX `task_templates_default_agent_id_idx` ON `task_templates` (`default_agent_id`);
--> statement-breakpoint
CREATE INDEX `task_templates_next_occurrence_at_idx` ON `task_templates` (`next_occurrence_at`);
--> statement-breakpoint
ALTER TABLE `tasks` ADD `default_agent_id` text REFERENCES `agents`(`id`);
--> statement-breakpoint
ALTER TABLE `tasks` ADD `latest_run_id` text;
--> statement-breakpoint
ALTER TABLE `tasks` ADD `source_template_id` text REFERENCES `task_templates`(`id`);
--> statement-breakpoint
ALTER TABLE `tasks` ADD `source_occurrence_at` integer;
--> statement-breakpoint
ALTER TABLE `tasks` ADD `scheduled_at` integer;
--> statement-breakpoint
ALTER TABLE `tasks` ADD `done_at` integer;
--> statement-breakpoint
CREATE INDEX `tasks_default_agent_id_idx` ON `tasks` (`default_agent_id`);
--> statement-breakpoint
CREATE INDEX `tasks_source_template_id_idx` ON `tasks` (`source_template_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_source_template_occurrence_unique_idx` ON `tasks` (`source_template_id`, `source_occurrence_at`);
--> statement-breakpoint
CREATE INDEX `tasks_scheduled_at_idx` ON `tasks` (`scheduled_at`);
--> statement-breakpoint
CREATE INDEX `tasks_done_at_idx` ON `tasks` (`done_at`);
--> statement-breakpoint
ALTER TABLE `task_runs` ADD `subtask_id` text REFERENCES `task_subtasks`(`id`);
--> statement-breakpoint
ALTER TABLE `task_runs` ADD `outcome` text;
--> statement-breakpoint
ALTER TABLE `task_runs` ADD `trigger_metadata_json` text;
--> statement-breakpoint
CREATE INDEX `task_runs_subtask_id_idx` ON `task_runs` (`subtask_id`);
--> statement-breakpoint
CREATE INDEX `task_runs_outcome_idx` ON `task_runs` (`outcome`);
