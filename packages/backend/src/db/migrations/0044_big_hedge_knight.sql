PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_task_run_followups` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`run_id` text,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`body` text NOT NULL,
	`request_id` text,
	`payload_json` text,
	`delivery_started_at` integer,
	`baseline_message_count` integer,
	`delivered_at` integer,
	`answer_body` text,
	`answered_at` integer,
	`error_message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `task_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_task_run_followups`("id", "task_id", "run_id", "kind", "status", "body", "request_id", "payload_json", "delivery_started_at", "baseline_message_count", "delivered_at", "answer_body", "answered_at", "error_message", "created_at", "updated_at") SELECT "id", "task_id", "run_id", "kind", "status", "body", "request_id", "payload_json", "delivery_started_at", "baseline_message_count", "delivered_at", "answer_body", "answered_at", "error_message", "created_at", "updated_at" FROM `task_run_followups`;--> statement-breakpoint
DROP TABLE `task_run_followups`;--> statement-breakpoint
ALTER TABLE `__new_task_run_followups` RENAME TO `task_run_followups`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `task_run_followups_request_unique_idx` ON `task_run_followups` (`run_id`,`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `task_pending_replies_request_unique_idx` ON `task_run_followups` (`task_id`,`request_id`) WHERE "task_run_followups"."run_id" is null;--> statement-breakpoint
CREATE INDEX `task_run_followups_task_id_idx` ON `task_run_followups` (`task_id`);--> statement-breakpoint
CREATE INDEX `task_run_followups_run_id_idx` ON `task_run_followups` (`run_id`);--> statement-breakpoint
CREATE INDEX `task_run_followups_run_status_idx` ON `task_run_followups` (`run_id`,`status`);--> statement-breakpoint
CREATE INDEX `task_run_followups_created_at_idx` ON `task_run_followups` (`created_at`);