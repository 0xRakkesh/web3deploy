DROP TABLE `deployments`;--> statement-breakpoint
ALTER TABLE `projects` ADD `status` text DEFAULT 'queued' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `deployment_url` text;--> statement-breakpoint
CREATE UNIQUE INDEX `projects_deployment_url_unique` ON `projects` (`deployment_url`);