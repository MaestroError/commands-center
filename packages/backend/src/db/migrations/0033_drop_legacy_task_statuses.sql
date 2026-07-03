-- Retire the pre-board task statuses that nothing writes anymore. The board
-- migration (0011) kept old rows as-is, so long-lived databases can still hold
-- them. Map to 'backlog', which is exactly how the frontend has been rendering
-- these statuses since the board landed (readBoardStatus falls back to backlog
-- for any non-board status), so this is behavior-preserving.
-- 'draft', 'enabled' and 'disabled' stay: they are still actively written (see
-- legacyTaskStatusSchema in @cc/shared/schemas/tasks).
UPDATE `tasks` SET `status` = 'backlog' WHERE `status` IN ('running', 'in_progress', 'completed');
