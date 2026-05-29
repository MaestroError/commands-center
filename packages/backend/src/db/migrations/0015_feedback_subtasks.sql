PRAGMA foreign_keys=OFF;--> statement-breakpoint
DELETE FROM `task_runs`;--> statement-breakpoint
DELETE FROM `task_subtasks`;--> statement-breakpoint
DROP TABLE `task_subtasks`;--> statement-breakpoint
DROP TABLE `task_comments`;--> statement-breakpoint
CREATE TABLE `task_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `task_feedback_task_id_idx` ON `task_feedback` (`task_id`);--> statement-breakpoint
CREATE INDEX `task_feedback_deleted_at_idx` ON `task_feedback` (`deleted_at`);--> statement-breakpoint
CREATE TABLE `task_subtasks` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`feedback_id` text,
	`agent_id` text NOT NULL,
	`description` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`feedback_id`) REFERENCES `task_feedback`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `task_subtasks_task_id_idx` ON `task_subtasks` (`task_id`);--> statement-breakpoint
CREATE INDEX `task_subtasks_feedback_id_idx` ON `task_subtasks` (`feedback_id`);--> statement-breakpoint
CREATE INDEX `task_subtasks_agent_id_idx` ON `task_subtasks` (`agent_id`);--> statement-breakpoint
CREATE INDEX `task_subtasks_deleted_at_idx` ON `task_subtasks` (`deleted_at`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
