import { Hono } from "hono";
import { getDB } from "../db/index.js";
import { projects, users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { CloudflareBindings, Variables } from "../index.js";
import { deleteS3Prefix } from "../lib/s3.js";

export const cliProjectsRouter = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

// GET /api/cli/projects
cliProjectsRouter.get("/", async (c) => {
  const authUser = c.get("authUser");
  if (!authUser) return c.json({ error: "Unauthorized" }, 401);

  const db = getDB(c.env);

  const user = await db.select().from(users).where(eq(users.id, authUser.user_id)).get();
  if (!user) return c.json({ error: "User not found" }, 404);

  const userProjects = await db
    .select()
    .from(projects)
    .where(eq(projects.user_id, authUser.user_id))
    .all();

  return c.json({
    user: { githubId: user.github_id, login: user.login, avatarUrl: user.avatar_url },
    projects: userProjects.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      deploymentUrl: p.deployment_url,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    })),
  });
});

// DELETE /api/cli/projects/:id
cliProjectsRouter.delete("/:id", async (c) => {
  const authUser = c.get("authUser");
  if (!authUser) return c.json({ error: "Unauthorized" }, 401);

  const projectId = c.req.param("id");
  const db = getDB(c.env);

  const project = await db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) return c.json({ error: "Project not found" }, 404);
  if (project.user_id !== authUser.user_id) return c.json({ error: "Forbidden" }, 403);

  // Delete all S3 objects under the project's prefix
  try {
    await deleteS3Prefix(c.env, `__outputs/${project.name}/`);
  } catch (error) {
    console.error("S3 Cleanup Error:", error);
    // Continue to DB deletion even if S3 cleanup partially fails
  }

  await db.delete(projects).where(eq(projects.id, projectId)).run();

  return c.json({ success: true, deletedProjectId: projectId });
});
