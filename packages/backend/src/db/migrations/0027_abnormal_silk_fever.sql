CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`relative_path` text NOT NULL,
	`author` text,
	`title` text,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `documents_relative_path_unique` ON `documents` (`relative_path`);