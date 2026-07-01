CREATE TABLE `artifact_share_links` (
	`id` text PRIMARY KEY NOT NULL,
	`artifact_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`token_prefix` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	`last_used_at` integer,
	`download_count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`artifact_id`) REFERENCES `artifacts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artifact_share_links_token_hash_unique` ON `artifact_share_links` (`token_hash`);--> statement-breakpoint
CREATE INDEX `artifact_share_links_artifact_id_idx` ON `artifact_share_links` (`artifact_id`);--> statement-breakpoint
CREATE INDEX `artifact_share_links_expires_at_idx` ON `artifact_share_links` (`expires_at`);--> statement-breakpoint
CREATE TABLE `artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`type` text NOT NULL,
	`link` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `artifacts_conversation_id_idx` ON `artifacts` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `artifacts_conversation_created_idx` ON `artifacts` (`conversation_id`,`created_at`);--> statement-breakpoint
DROP TABLE `task_artifact_share_links`;--> statement-breakpoint
ALTER TABLE `task_runs` DROP COLUMN `artifacts_json`;