DROP INDEX `activities_dedupe_key_idx`;--> statement-breakpoint
UPDATE `activities`
SET
	`status` = 'archived',
	`archived_at` = CAST(strftime('%s', 'now') AS INTEGER) * 1000,
	`updated_at` = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE
	`status` = 'pending'
	AND `dedupe_key` IS NOT NULL
	AND EXISTS (
		SELECT 1
		FROM `activities` AS `newer`
		WHERE
			`newer`.`status` = 'pending'
			AND `newer`.`dedupe_key` = `activities`.`dedupe_key`
			AND (
				`newer`.`updated_at` > `activities`.`updated_at`
				OR (
					`newer`.`updated_at` = `activities`.`updated_at`
					AND `newer`.`id` > `activities`.`id`
				)
			)
	);--> statement-breakpoint
CREATE UNIQUE INDEX `activities_pending_dedupe_key_unique_idx` ON `activities` (`dedupe_key`) WHERE "activities"."status" = 'pending';
