-- Retire the pre-board task statuses that nothing writes anymore. The board
-- migration (0011) kept old rows as-is, so long-lived databases can still hold
-- them. Map to 'backlog', matching the board view's existing fallback
-- (readBoardStatus renders any non-board status as backlog). Views that show
-- the raw status (task detail badge, global search) switch from the stale
-- legacy label to 'backlog'.
-- 'draft', 'enabled' and 'disabled' stay: they are still actively written (see
-- legacyTaskStatusSchema in @cc/shared/schemas/tasks).
UPDATE `tasks` SET `status` = 'backlog' WHERE `status` IN ('running', 'in_progress', 'completed');
