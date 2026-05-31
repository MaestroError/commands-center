DROP INDEX `task_templates_trigger_mode_idx`;--> statement-breakpoint
ALTER TABLE `task_templates` DROP COLUMN `trigger_mode`;--> statement-breakpoint
ALTER TABLE `task_templates` DROP COLUMN `schedule_json`;--> statement-breakpoint
DROP INDEX `tasks_trigger_mode_idx`;--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `trigger_mode`;--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `schedule_json`;