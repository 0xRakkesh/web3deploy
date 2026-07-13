
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";



export const projects = sqliteTable('projects', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    project_id: text('project_id').unique().notNull(),
    user_id: text('user_id').notNull(),
    github_repo: text('github_repo').notNull(),
    framework: text('framework').notNull(),
    env_vars: text('env_vars'),
    build_command: text('build_command').notNull().default('npm run build'),
    install_command: text('install_command').notNull().default('npm install'),
    output_dir: text('output_dir').notNull(),
    root_dir: text('root_dir').default('/'),
    created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const deployments = sqliteTable('deployments', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    project_id: text('project_id').references(() => projects.id).notNull(),
    user_id: text('user_id').notNull(),
    status: text('status').notNull().default('queued'),
    commit_hash: text('commit_hash').notNull(),
    deployment_url: text('deployment_url'),
    logs: text('logs'),
    created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});