DROP INDEX `custom_tools_name_unique`;
--> statement-breakpoint
ALTER TABLE `custom_tools` RENAME TO `custom_tools_old`;
--> statement-breakpoint
CREATE TABLE `custom_tools` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`entry_file` text NOT NULL,
	`fingerprint` text NOT NULL,
	`enabled` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `custom_tools_slug_unique` ON `custom_tools` (`slug`);
--> statement-breakpoint
CREATE UNIQUE INDEX `custom_tools_name_unique` ON `custom_tools` (`name`);
--> statement-breakpoint
INSERT INTO `custom_tools` (`id`, `slug`, `name`, `description`, `entry_file`, `fingerprint`, `enabled`, `created_at`, `updated_at`)
SELECT
	`id`,
	lower(replace(`name`, ' ', '-')),
	`name`,
	`description`,
	'tool.ts',
	'',
	`enabled`,
	`created_at`,
	`updated_at`
FROM `custom_tools_old`;
--> statement-breakpoint
DROP TABLE `custom_tools_old`;
