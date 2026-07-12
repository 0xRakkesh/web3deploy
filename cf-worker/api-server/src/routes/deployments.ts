import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { CloudflareBindings } from "../index";
import { getDB } from "../db";
import { deployments, projects } from "../db/schema";
import { eq, and } from "drizzle-orm";

const updateDeploymentSchema = z.object({
  status: z.enum(['queued', 'building', 'success', 'failed']),
  deployment_url: z.string().url().optional(),
  logs: z.string().optional(),
});

const deploymentsRouter = new Hono<{ Bindings: CloudflareBindings }>();

deploymentsRouter.get('/:projectId', async (c) => {
  const db = getDB(c.env);
  const projectId = c.req.param('projectId');
  
  const jwtPayload = c.get('jwtPayload') as { user_id: string };
  const user_id = jwtPayload.user_id;

  try {
    const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.user_id, user_id)));
    if (!project) {
       return c.json({ error: "Forbidden: You do not own this project or it does not exist." }, 403);
    }

    const results = await db.select().from(deployments).where(eq(deployments.project_id, projectId));
    return c.json({ deployments: results });
  } catch (error) {
    return c.json({ error: "Failed to fetch deployments" }, 500);
  }
});

deploymentsRouter.patch('/:id', zValidator('json', updateDeploymentSchema), async (c) => {
  const body = c.req.valid('json');
  const db = getDB(c.env);
  const deploymentId = c.req.param('id');
  
  const jwtPayload = c.get('jwtPayload') as { user_id: string } | undefined;
  const user_id = jwtPayload?.user_id;

  try {
    let updatedDeployment;

    if (user_id === 'service_account') {
      [updatedDeployment] = await db.update(deployments)
        .set(body)
        .where(eq(deployments.id, deploymentId))
        .returning();
    } else {
      [updatedDeployment] = await db.update(deployments)
        .set(body)
        .where(and(eq(deployments.id, deploymentId), eq(deployments.user_id, user_id!)))
        .returning();
    }
    
    if (!updatedDeployment) {
      return c.json({ error: "Deployment not found or you are not authorized to update it." }, 404);
    }

    return c.json({ deployment: updatedDeployment });
  } catch (error) {
    console.error("Database error:", error);
    return c.json({ error: "Failed to update deployment" }, 500);
  }
});

export default deploymentsRouter;
