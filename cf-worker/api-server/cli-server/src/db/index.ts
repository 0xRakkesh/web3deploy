import { drizzle } from "drizzle-orm/d1"
import { projects, users, sessions } from "./schema"


export function getDB(env: { DB: D1Database }) {
    return drizzle(env.DB, {
        schema: { projects, users, sessions }
    });
}
