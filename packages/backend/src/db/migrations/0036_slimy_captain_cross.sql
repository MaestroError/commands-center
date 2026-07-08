CREATE TABLE `api_token_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`token_id` text NOT NULL,
	`token_name` text NOT NULL,
	`surface` text NOT NULL,
	`action` text NOT NULL,
	`capability_id` text,
	`target_kind` text,
	`target_id` text,
	`input_summary_json` text,
	`outcome` text NOT NULL,
	`status_code` integer,
	`error_message` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `api_token_activity_token_created_idx` ON `api_token_activity` (`token_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `api_token_activity_created_idx` ON `api_token_activity` (`created_at`);