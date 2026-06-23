ALTER TABLE `conversations` ADD `system_prompt_overrides_json` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `system_prompt_snapshot_json` text;