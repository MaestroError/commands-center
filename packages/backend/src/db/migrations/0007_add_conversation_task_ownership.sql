ALTER TABLE `conversations` ADD `source` text DEFAULT 'chat' NOT NULL;
--> statement-breakpoint
ALTER TABLE `conversations` ADD `task_id` text REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action;
--> statement-breakpoint
ALTER TABLE `conversations` ADD `task_run_id` text REFERENCES `task_runs`(`id`) ON UPDATE no action ON DELETE no action;
--> statement-breakpoint
ALTER TABLE `conversations` ADD `converted_at` integer;
--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_task_run_id_unique` ON `conversations` (`task_run_id`);
--> statement-breakpoint
CREATE INDEX `conversations_agent_source_idx` ON `conversations` (`agent_id`,`source`);
--> statement-breakpoint
CREATE INDEX `conversations_task_id_idx` ON `conversations` (`task_id`);
