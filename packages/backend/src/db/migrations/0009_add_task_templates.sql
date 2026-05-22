CREATE TABLE `task_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`todos_json` text NOT NULL,
	`status` text NOT NULL,
	`trigger_mode` text NOT NULL,
	`schedule_json` text NOT NULL,
	`permission_profile_json` text,
	`enabled` integer NOT NULL,
	`archived` integer NOT NULL,
	`latest_result_summary` text,
	`latest_task_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`archived_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `task_templates_agent_id_idx` ON `task_templates` (`agent_id`);
--> statement-breakpoint
CREATE INDEX `task_templates_status_idx` ON `task_templates` (`status`);
--> statement-breakpoint
CREATE INDEX `task_templates_trigger_mode_idx` ON `task_templates` (`trigger_mode`);
--> statement-breakpoint
CREATE INDEX `task_templates_archived_idx` ON `task_templates` (`archived`);
--> statement-breakpoint
CREATE INDEX `task_templates_deleted_at_idx` ON `task_templates` (`deleted_at`);
--> statement-breakpoint
ALTER TABLE `tasks` ADD `template_id` text REFERENCES `task_templates`(`id`);
--> statement-breakpoint
ALTER TABLE `tasks` ADD `trigger_source` text;
--> statement-breakpoint
ALTER TABLE `tasks` ADD `scheduled_for` integer;
--> statement-breakpoint
ALTER TABLE `tasks` ADD `due_at` integer;
--> statement-breakpoint
CREATE INDEX `tasks_template_id_idx` ON `tasks` (`template_id`);
--> statement-breakpoint
INSERT INTO `task_templates` (
	`id`,
	`agent_id`,
	`title`,
	`description`,
	`todos_json`,
	`status`,
	`trigger_mode`,
	`schedule_json`,
	`permission_profile_json`,
	`enabled`,
	`archived`,
	`latest_result_summary`,
	`latest_task_id`,
	`created_at`,
	`updated_at`,
	`archived_at`,
	`deleted_at`
)
SELECT
	`id`,
	`agent_id`,
	`title`,
	`description`,
	`todos_json`,
	`status`,
	`trigger_mode`,
	`schedule_json`,
	`permission_profile_json`,
	`enabled`,
	`archived`,
	`latest_result_summary`,
	NULL,
	`created_at`,
	`updated_at`,
	`archived_at`,
	`deleted_at`
FROM `tasks`
WHERE `trigger_mode` != 'manual';
--> statement-breakpoint
UPDATE `tasks` SET `template_id` = `id` WHERE `trigger_mode` != 'manual';
