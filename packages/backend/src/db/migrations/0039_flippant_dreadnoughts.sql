CREATE TABLE `oauth_records` (
	`model` text NOT NULL,
	`id` text NOT NULL,
	`payload_json` text NOT NULL,
	`grant_id` text,
	`user_code` text,
	`uid` text,
	`consumed_at` integer,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`model`, `id`)
);
--> statement-breakpoint
CREATE INDEX `oauth_records_model_grant_id_idx` ON `oauth_records` (`model`,`grant_id`);--> statement-breakpoint
CREATE INDEX `oauth_records_model_user_code_idx` ON `oauth_records` (`model`,`user_code`);--> statement-breakpoint
CREATE INDEX `oauth_records_model_uid_idx` ON `oauth_records` (`model`,`uid`);--> statement-breakpoint
CREATE INDEX `oauth_records_model_expires_at_idx` ON `oauth_records` (`model`,`expires_at`);