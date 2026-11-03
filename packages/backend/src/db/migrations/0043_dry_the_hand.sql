ALTER TABLE `task_subtasks` ADD `owner_run_id` text REFERENCES task_runs(id);--> statement-breakpoint
ALTER TABLE `task_subtasks` ADD `request_id` text;--> statement-breakpoint
ALTER TABLE `task_subtasks` ADD `expected_output` text;--> statement-breakpoint
ALTER TABLE `task_subtasks` ADD `input_artifact_ids` text;--> statement-breakpoint
ALTER TABLE `task_subtasks` ADD `accepted_at` integer;--> statement-breakpoint
ALTER TABLE `task_subtasks` ADD `revision_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `task_subtasks_owner_request_unique_idx` ON `task_subtasks` (`owner_run_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `task_subtasks_owner_idx` ON `task_subtasks` (`owner_run_id`);