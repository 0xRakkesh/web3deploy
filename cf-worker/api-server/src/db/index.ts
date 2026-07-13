import { drizzle } from "drizzle-orm/d1"
import { deployments, projects } from "./schema"


export function getDB(env: { DB: D1Database }) {
    return drizzle(env.DB, {
        schema: { deployments, projects }
    });
}
