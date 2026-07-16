
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable('projects', {
	id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
	name: text('name').unique().notNull(), // The project's unique slug (e.g., 'my-awesome-project')
	user_id: text('user_id').notNull(),
	env_vars: text('env_vars', { mode: 'json' }),
	status: text('status').notNull().default('queued'),
	deployment_url: text('deployment_url').unique(),
	created_at: text('created_at').$defaultFn(() => new Date().toLocaleString()),
	updated_at: text('updated_at').$defaultFn(() => new Date().toLocaleString()),
}, (table) => ({
	userIdIdx: index('user_id_idx').on(table.user_id),
}));

export const domains = sqliteTable('domains', {
	id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
	project_id: text('project_id').references(() => projects.id).notNull(),
	user_id: text('user_id').notNull(),
	domain: text('domain').unique().notNull(), // e.g., 'my-custom-domain.com'
	verified: integer('verified', { mode: 'boolean' }).default(false),
	created_at: text('created_at').$defaultFn(() => new Date().toLocaleString()),
	updated_at: text('updated_at').$defaultFn(() => new Date().toLocaleString()),
});

export const users = sqliteTable('users', {
	id: text('id').primaryKey(),
	github_id: text('github_id').unique().notNull(),
	email: text('email').notNull(),
	login: text('login').notNull(),
	avatar_url: text('avatar_url'),
	created_at: text('created_at').$defaultFn(() => new Date().toLocaleString()),
	updated_at: text('updated_at').$defaultFn(() => new Date().toLocaleString()),
});

export const sessions = sqliteTable('sessions', {
	id: text('id').primaryKey(), // Maps to the JWT 'jti'
	user_id: text('user_id').references(() => users.id).notNull(),
	expires_at: text('expires_at').notNull(),
	created_at: text('created_at').$defaultFn(() => new Date().toLocaleString()),
	revoked_at: text('revoked_at'), // Null means active
});
