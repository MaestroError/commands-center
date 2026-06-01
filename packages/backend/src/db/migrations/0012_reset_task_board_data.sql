DELETE FROM `messages`
WHERE `conversation_id` IN (
	SELECT `id`
	FROM `conversations`
	WHERE `source` = 'task_run'
		OR `task_id` IS NOT NULL
		OR `task_run_id` IS NOT NULL
);
--> statement-breakpoint
DELETE FROM `conversations`
WHERE `source` = 'task_run'
	OR `task_id` IS NOT NULL
	OR `task_run_id` IS NOT NULL;
--> statement-breakpoint
DELETE FROM `task_comments`;
--> statement-breakpoint
DELETE FROM `task_runs`;
--> statement-breakpoint
DELETE FROM `task_scheduler_state`;
--> statement-breakpoint
DELETE FROM `task_subtasks`;
--> statement-breakpoint
DELETE FROM `tasks`;
--> statement-breakpoint
DELETE FROM `task_templates`;
