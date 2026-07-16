import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDB } from "../db/index.js";
import { projects } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { CloudflareBindings, Variables } from "../index.js";
import { getPresignedPutUrl, deleteS3Prefix } from "../lib/s3.js";

export const cliDeployRouter = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

const deployInitSchema = z.object({
  requestedSlug: z.string(),
  files: z.array(z.object({ path: z.string(), contentType: z.string() })),
});

// POST /api/cli/deploy/init
cliDeployRouter.post("/init", zValidator("json", deployInitSchema), async (c) => {
  const { requestedSlug, files } = c.req.valid("json");
  const authUser = c.get("authUser");
  if (!authUser) return c.json({ error: "Unauthorized" }, 401);

  const db = getDB(c.env);
  let finalSlug = requestedSlug;
  let project = await db.select().from(projects).where(eq(projects.name, requestedSlug)).get();

  if (project) {
    if (project.user_id !== authUser.user_id) {
      return c.json(
        { error: `Project name "${requestedSlug}" is already taken. Please choose a different name.` },
        409
      );
    }
    // Update existing project to building status
    const result = await db
      .update(projects)
      .set({ status: "building", updated_at: new Date().toLocaleString() })
      .where(eq(projects.id, project.id))
      .returning()
      .get();
    if (result) project = result;

    // Clean up old S3 files to prevent orphaned files bloating storage
    try {
      await deleteS3Prefix(c.env, `__outputs/${finalSlug}/`);
    } catch (error) {
      console.error("S3 Cleanup Error during redeploy:", error);
    }
  } else {
    // Create a new project
    project = await db
      .insert(projects)
      .values({ name: finalSlug, user_id: authUser.user_id, status: "building" })
      .returning()
      .get();
  }

  if (!project) return c.json({ error: "Failed to create or retrieve project" }, 500);

  // Generate presigned PUT URLs for each file concurrently
  const uploadUrls: Record<string, string> = {};
  await Promise.all(
    files.map(async (file) => {
      const objectKey = `__outputs/${finalSlug}/${file.path}`;
      uploadUrls[file.path] = await getPresignedPutUrl(c.env, objectKey, file.contentType);
    })
  );

  return c.json({ finalSlug, projectId: project.id, uploadUrls });
});

// POST /api/cli/deploy/success
cliDeployRouter.post(
  "/success",
  zValidator("json", z.object({ projectId: z.string() })),
  async (c) => {
    const { projectId } = c.req.valid("json");
    const authUser = c.get("authUser");
    if (!authUser) return c.json({ error: "Unauthorized" }, 401);

    const db = getDB(c.env);
    const project = await db.select().from(projects).where(eq(projects.id, projectId)).get();

    if (!project || project.user_id !== authUser.user_id) {
      return c.json({ error: "Project not found or forbidden" }, 403);
    }

    const deploymentUrl = `${project.name}.web3deploy.me`;
    await db
      .update(projects)
      .set({ status: "success", deployment_url: deploymentUrl, updated_at: new Date().toLocaleString() })
      .where(eq(projects.id, projectId))
      .run();

    return c.json({ success: true, deploymentUrl });
  }
);
