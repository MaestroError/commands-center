ALTER TABLE `task_runs` RENAME COLUMN `result_summary` TO `final_message`;--> statement-breakpoint
ALTER TABLE `tasks` RENAME COLUMN `latest_result_summary` TO `latest_final_message`;--> statement-breakpoint
ALTER TABLE `task_templates` RENAME COLUMN `latest_result_summary` TO `latest_final_message`;--> statement-breakpoint
ALTER TABLE `task_runs` ADD `result_text` text;--> statement-breakpoint
ALTER TABLE `task_runs` ADD `artifacts_json` text DEFAULT '[]';--> statement-breakpoint
ALTER TABLE `task_runs` ADD `needs_human_review` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `task_runs` ADD `human_review_reason` text;
