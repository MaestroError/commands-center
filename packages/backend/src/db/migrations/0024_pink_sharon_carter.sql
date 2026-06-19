ALTER TABLE `tasks` ADD `generated_by_agent_id` text REFERENCES agents(id);--> statement-breakpoint
CREATE INDEX `tasks_generated_by_agent_id_idx` ON `tasks` (`generated_by_agent_id`);