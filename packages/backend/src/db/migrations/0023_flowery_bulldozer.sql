ALTER TABLE `task_runs` ADD `fallback_models` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `task_runs` ADD `retry_of_run_id` text REFERENCES task_runs(id);--> statement-breakpoint
ALTER TABLE `task_templates` ADD `fallback_models` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `fallback_models` text DEFAULT '[]' NOT NULL;