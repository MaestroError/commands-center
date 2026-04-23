PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__new_agents` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`instructions` text NOT NULL,
	`default_model` text NOT NULL,
	`icon_path` text,
	`status` text NOT NULL,
	`capabilities_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`archived_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_agents` (`id`, `slug`, `name`, `role`, `instructions`, `default_model`, `icon_path`, `status`, `capabilities_json`, `created_at`, `updated_at`, `archived_at`)
SELECT `id`, `slug`, `name`, `role`, `instructions`, `default_model`, `icon_path`, `status`, `capabilities_json`, `created_at`, `updated_at`, `archived_at` FROM `agents`;
--> statement-breakpoint
DROP TABLE `agents`;
--> statement-breakpoint
ALTER TABLE `__new_agents` RENAME TO `agents`;
--> statement-breakpoint
CREATE UNIQUE INDEX `agents_slug_unique` ON `agents` (`slug`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
