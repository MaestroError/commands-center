CREATE TABLE `secrets` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`encrypted_value` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `secrets_key_unique` ON `secrets` (`key`);
