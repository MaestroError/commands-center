CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`level` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`payload_json` text,
	`dedupe_key` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`archived_at` integer
);
--> statement-breakpoint
CREATE INDEX `activities_status_idx` ON `activities` (`status`);--> statement-breakpoint
CREATE INDEX `activities_dedupe_key_idx` ON `activities` (`dedupe_key`);