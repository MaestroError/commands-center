ALTER TABLE `task_templates` ADD `prompt_path` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `task_templates` DROP COLUMN `description`;