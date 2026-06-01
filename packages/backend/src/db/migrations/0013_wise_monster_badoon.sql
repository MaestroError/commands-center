PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_task_scheduler_state` (
	`task_id` text PRIMARY KEY NOT NULL,
	`next_run_at` integer,
	`last_scheduled_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_task_scheduler_state`("task_id", "next_run_at", "last_scheduled_at", "last_error", "created_at", "updated_at") SELECT "task_id", "next_run_at", "last_scheduled_at", "last_error", "created_at", "updated_at" FROM `task_scheduler_state`;--> statement-breakpoint
DROP TABLE `task_scheduler_state`;--> statement-breakpoint
ALTER TABLE `__new_task_scheduler_state` RENAME TO `task_scheduler_state`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `task_scheduler_state_next_run_at_idx` ON `task_scheduler_state` (`next_run_at`);