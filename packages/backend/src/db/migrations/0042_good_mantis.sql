ALTER TABLE `task_run_followups` ADD `request_id` text;--> statement-breakpoint
ALTER TABLE `task_run_followups` ADD `payload_json` text;--> statement-breakpoint
ALTER TABLE `task_run_followups` ADD `delivery_started_at` integer;--> statement-breakpoint
ALTER TABLE `task_run_followups` ADD `baseline_message_count` integer;--> statement-breakpoint
ALTER TABLE `task_run_followups` ADD `delivered_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `task_run_followups_request_unique_idx` ON `task_run_followups` (`run_id`,`request_id`);