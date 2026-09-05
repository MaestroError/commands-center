UPDATE `conversations`
SET `is_current` = false
WHERE `is_current` = true
  AND EXISTS (
    SELECT 1
    FROM `conversations` AS `newer`
    WHERE `newer`.`agent_id` = `conversations`.`agent_id`
      AND `newer`.`is_current` = true
      AND (
        `newer`.`updated_at` > `conversations`.`updated_at`
        OR (
          `newer`.`updated_at` = `conversations`.`updated_at`
          AND `newer`.`id` > `conversations`.`id`
        )
      )
  );--> statement-breakpoint
DROP INDEX `conversations_agent_current_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_agent_current_idx` ON `conversations` (`agent_id`) WHERE "conversations"."is_current" = true;
