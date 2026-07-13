import { Hono } from "hono";
import { CloudflareBindings, Variables } from "../index";
import { getDB } from "../db";
import { projects } from "../db/schema";
import { eq, and } from "drizzle-orm";

const logsRouter = new Hono<{ Bindings: CloudflareBindings, Variables: Variables }>();

logsRouter.get('/:projectId', async (c) => {
  const db = getDB(c.env);
  const projectId = c.req.param('projectId');
  
  const authUser = c.get('authUser') as { user_id: string } | undefined;
  const user_id = authUser?.user_id;

  try {
    const [project] = await db.select().from(projects).where(and(eq(projects.project_id, projectId), eq(projects.user_id, user_id!)));
    if (!project) {
       return c.json({ error: "Forbidden: You do not own this project or it does not exist." }, 403);
    }

    const redisUrl = c.env.UPSTASH_REDIS_REST_URL;
    const redisToken = c.env.UPSTASH_REDIS_REST_TOKEN;

    if (!redisUrl || !redisToken) {
      return c.json({ error: "Redis configuration is missing." }, 500);
    }

    const response = await fetch(`${redisUrl}/lrange/logs:${projectId}/0/-1`, {
      headers: {
        Authorization: `Bearer ${redisToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`Redis responded with status: ${response.status}`);
    }

    const data = await response.json() as { result: string[] };
    
    return c.json({ logs: data.result || [] });
  } catch (error) {
    console.error("Failed to fetch logs from Redis:", error);
    return c.json({ error: "Failed to fetch logs" }, 500);
  }
});

export default logsRouter;
