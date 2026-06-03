CREATE TABLE `task_artifact_share_links` (
	`id` text PRIMARY KEY NOT NULL,
	`artifact_id` text NOT NULL,
	`task_id` text NOT NULL,
	`run_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`token_prefix` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	`last_used_at` integer,
	`download_count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `task_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_artifact_share_links_token_hash_unique` ON `task_artifact_share_links` (`token_hash`);--> statement-breakpoint
CREATE INDEX `task_artifact_share_links_artifact_id_idx` ON `task_artifact_share_links` (`artifact_id`);--> statement-breakpoint
CREATE INDEX `task_artifact_share_links_task_run_idx` ON `task_artifact_share_links` (`task_id`,`run_id`);--> statement-breakpoint
CREATE INDEX `task_artifact_share_links_expires_at_idx` ON `task_artifact_share_links` (`expires_at`);
