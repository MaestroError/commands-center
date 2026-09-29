ALTER TABLE `messages` ADD `tokens_json` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `cost` real;--> statement-breakpoint
ALTER TABLE `messages` ADD `model_id` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `provider_id` text;