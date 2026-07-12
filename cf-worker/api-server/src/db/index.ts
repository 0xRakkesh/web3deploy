import { drizzle } from "drizzle-orm/d1"
import { users, deployments, projects } from "./schema"

/**
 * 📚 BOOKMARK: TypeScript Syntax Study
 * 
 * - We use `:` (Type Annotation) here: `env: { DB: D1Database }`
 *   This tells TS the EXACT shape of the parameter we are receiving.
 *   "The `env` object MUST have a `DB` property of type `D1Database`".
 * 
 * - We use `< >` (Generics) when a class/function can accept ANY type,
 *   like `new Hono<{ Bindings: ... }>()`.
 */
export function getDB(env: { DB: D1Database }) {
    return drizzle(env.DB, {
        schema: { users, deployments, projects }
    });
}