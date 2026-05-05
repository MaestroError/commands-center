CREATE TABLE `task_scheduler_state` (
	`task_id` text PRIMARY KEY NOT NULL,
	`next_run_at` integer,
	`last_scheduled_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `task_scheduler_state_next_run_at_idx` ON `task_scheduler_state` (`next_run_at`);
