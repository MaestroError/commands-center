ALTER TABLE `messages` ADD `tokens_input` integer;--> statement-breakpoint
ALTER TABLE `messages` ADD `tokens_output` integer;--> statement-breakpoint
ALTER TABLE `messages` ADD `tokens_reasoning` integer;--> statement-breakpoint
ALTER TABLE `messages` ADD `tokens_cache_read` integer;--> statement-breakpoint
ALTER TABLE `messages` ADD `tokens_cache_write` integer;--> statement-breakpoint
ALTER TABLE `messages` ADD `tokens_reported_total` integer;--> statement-breakpoint
ALTER TABLE `messages` ADD `agent` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `variant` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `finish` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `summary` integer;--> statement-breakpoint
ALTER TABLE `messages` ADD `completed_at` integer;--> statement-breakpoint
-- Backfill the typed columns from the short-lived tokens_json blob (0042).
UPDATE `messages` SET
  `tokens_input` = json_extract(`tokens_json`, '$.input'),
  `tokens_output` = json_extract(`tokens_json`, '$.output'),
  `tokens_reasoning` = json_extract(`tokens_json`, '$.reasoning'),
  `tokens_cache_read` = json_extract(`tokens_json`, '$.cacheRead'),
  `tokens_cache_write` = json_extract(`tokens_json`, '$.cacheWrite'),
  `tokens_reported_total` = json_extract(`tokens_json`, '$.total')
WHERE `tokens_json` IS NOT NULL;
--> statement-breakpoint
-- completed_at was not stored before; updated_at held it, falling back to
-- created_at. Recover it only where the two differ, which means OpenCode did
-- report a completion. Equal timestamps are ambiguous and stay null.
UPDATE `messages` SET `completed_at` = `updated_at`
WHERE `role` = 'assistant' AND `updated_at` <> `created_at`;
