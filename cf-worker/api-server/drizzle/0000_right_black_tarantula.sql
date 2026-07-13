CREATE TABLE `deployments` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`commit_hash` text NOT NULL,
	`deployment_url` text,
	`logs` text,
	`created_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`github_repo` text NOT NULL,
	`framework` text NOT NULL,
	`env_vars` text,
	`build_command` text DEFAULT 'npm run build' NOT NULL,
	`install_command` text DEFAULT 'npm install' NOT NULL,
	`output_dir` text NOT NULL,
	`root_dir` text DEFAULT '/',
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_project_id_unique` ON `projects` (`project_id`);