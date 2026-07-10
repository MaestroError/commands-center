DROP INDEX `documents_relative_path_unique`;--> statement-breakpoint
ALTER TABLE `documents` ADD `scope` text DEFAULT 'global' NOT NULL;--> statement-breakpoint
ALTER TABLE `documents` ADD `owner_slug` text;--> statement-breakpoint
ALTER TABLE `documents` ADD `owner_specialist_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `documents_global_relative_path_unique` ON `documents` (`relative_path`) WHERE "documents"."scope" = 'global' and "documents"."owner_slug" is null and "documents"."owner_specialist_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX `documents_private_owner_path_unique` ON `documents` (`owner_specialist_id`,`relative_path`) WHERE "documents"."scope" = 'private' and "documents"."owner_specialist_id" is not null;
