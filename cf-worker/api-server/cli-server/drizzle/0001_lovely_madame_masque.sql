ALTER TABLE `deployments` DROP COLUMN `commit_hash`;--> statement-breakpoint
ALTER TABLE `deployments` DROP COLUMN `commit_message`;--> statement-breakpoint
ALTER TABLE `deployments` DROP COLUMN `source_type`;--> statement-breakpoint
ALTER TABLE `projects` DROP COLUMN `production_deployment_id`;