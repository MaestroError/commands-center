CREATE TABLE `task_run_followups` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`run_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`body` text NOT NULL,
	`sent_at` integer,
	`error_message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `task_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `task_run_followups_task_id_idx` ON `task_run_followups` (`task_id`);--> statement-breakpoint
CREATE INDEX `task_run_followups_run_id_idx` ON `task_run_followups` (`run_id`);--> statement-breakpoint
CREATE INDEX `task_run_followups_run_status_idx` ON `task_run_followups` (`run_id`,`status`);--> statement-breakpoint
CREATE INDEX `task_run_followups_created_at_idx` ON `task_run_followups` (`created_at`);--> statement-breakpoint
ALTER TABLE `task_runs` ADD `review_question_json` text;