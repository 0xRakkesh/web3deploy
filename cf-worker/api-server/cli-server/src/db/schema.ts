
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable('projects', {
	id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
	name: text('name').unique().notNull(), // The project's unique slug (e.g., 'my-awesome-project')
	user_id: text('user_id').notNull(),
	production_deployment_id: text('production_deployment_id'), // Pointer to the current active production deployment
	env_vars: text('env_vars', { mode: 'json' }),
	created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
	updated_at: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const deployments = sqliteTable('deployments', {
	id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
	project_id: text('project_id').references(() => projects.id).notNull(),
	user_id: text('user_id').notNull(),
	status: text('status').notNull().default('queued'), // e.g., 'queued', 'building', 'ready', 'failed'
	commit_hash: text('commit_hash'), // Nullable for local CLI deploys
	commit_message: text('commit_message'),
	source_type: text('source_type').notNull().default('github'), // 'github' or 'cli'
	deployment_url: text('deployment_url').unique(), // The specific, immutable URL for this deployment
	created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
	updated_at: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const domains = sqliteTable('domains', {
	id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
	project_id: text('project_id').references(() => projects.id).notNull(),
	user_id: text('user_id').notNull(),
	domain: text('domain').unique().notNull(), // e.g., 'my-custom-domain.com'
	verified: integer('verified', { mode: 'boolean' }).default(false),
	created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
	updated_at: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const users = sqliteTable('users', {
	id: text('id').primaryKey(),
	github_id: text('github_id').unique().notNull(),
	email: text('email').notNull(),
	login: text('login').notNull(),
	avatar_url: text('avatar_url'),
	created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
	updated_at: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const sessions = sqliteTable('sessions', {
	id: text('id').primaryKey(), // Maps to the JWT 'jti'
	user_id: text('user_id').references(() => users.id).notNull(),
	expires_at: integer('expires_at', { mode: 'timestamp' }).notNull(),
	created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
	revoked_at: integer('revoked_at', { mode: 'timestamp' }), // Null means active
});
