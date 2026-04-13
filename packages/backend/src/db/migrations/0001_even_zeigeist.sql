CREATE TABLE `__new_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`opencode_session_id` text NOT NULL,
	`title` text,
	`status` text NOT NULL,
	`is_current` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_conversations` (`id`, `agent_id`, `opencode_session_id`, `title`, `status`, `is_current`, `created_at`, `updated_at`)
SELECT `id`, `agent_id`, `id`, `title`, `status`, false, `created_at`, `updated_at` FROM `conversations`;
--> statement-breakpoint
DROP TABLE `conversations`;
--> statement-breakpoint
ALTER TABLE `__new_conversations` RENAME TO `conversations`;
--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_opencode_session_id_unique` ON `conversations` (`opencode_session_id`);
--> statement-breakpoint
CREATE INDEX `conversations_agent_id_idx` ON `conversations` (`agent_id`);
--> statement-breakpoint
CREATE INDEX `conversations_agent_current_idx` ON `conversations` (`agent_id`,`is_current`);
--> statement-breakpoint
CREATE TABLE `__new_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`parts_json` text,
	`attachments_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_messages` (`id`, `conversation_id`, `role`, `content`, `parts_json`, `attachments_json`, `created_at`, `updated_at`)
SELECT `id`, `conversation_id`, `role`, `content`, `parts_json`, NULL, `created_at`, `created_at` FROM `messages`;
--> statement-breakpoint
DROP TABLE `messages`;
--> statement-breakpoint
ALTER TABLE `__new_messages` RENAME TO `messages`;
--> statement-breakpoint
CREATE INDEX `messages_conversation_id_idx` ON `messages` (`conversation_id`);
