ALTER TABLE `artifacts` ADD `document_scope` text DEFAULT 'global' NOT NULL;--> statement-breakpoint
ALTER TABLE `artifacts` ADD `document_owner_slug` text;