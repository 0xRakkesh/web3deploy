import { Hono } from "hono";
import { getDB } from "../db/index.js";
import { projects, users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { AwsClient } from "aws4fetch";
import { CloudflareBindings, Variables } from "../index.js";

export const cliProjectsRouter = new Hono<{ Bindings: CloudflareBindings, Variables: Variables }>();

// GET /api/cli/projects
cliProjectsRouter.get('/', async (c) => {
  const authUser = c.get('authUser');
  if (!authUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const db = getDB(c.env);

  // 1. Get User Profile
  const user = await db.select().from(users).where(eq(users.id, authUser.user_id)).get();
  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  // 2. Get User Projects
  const userProjects = await db.select().from(projects).where(eq(projects.user_id, authUser.user_id)).all();

  return c.json({
    user: {
      githubId: user.github_id,
      login: user.login,
      avatarUrl: user.avatar_url,
    },
    projects: userProjects.map(p => ({
      id: p.id,
      name: p.name,
      status: p.status,
      deploymentUrl: p.deployment_url,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    }))
  });
});

// DELETE /api/cli/projects/:id
cliProjectsRouter.delete('/:id', async (c) => {
  const authUser = c.get('authUser');
  if (!authUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const projectId = c.req.param('id');
  const db = getDB(c.env);

  // 1. Verify project exists and belongs to user
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }
  if (project.user_id !== authUser.user_id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  // 2. Setup AWS Client for S3 deletion
  const aws = new AwsClient({
    accessKeyId: c.env.S3_ACCESS_KEY_ID,
    secretAccessKey: c.env.S3_SECRET_ACCESS_KEY,
    service: 's3',
    region: c.env.S3_REGION || 'us-east-1',
  });

  const prefix = `__outputs/${project.name}/`;
  
  // Resolve Endpoint URL
  const isAws = c.env.S3_ENDPOINT.includes('.amazonaws.com');
  const endpoint = c.env.S3_ENDPOINT.endsWith('/') ? c.env.S3_ENDPOINT.slice(0, -1) : c.env.S3_ENDPOINT;

  // 3. List and Delete objects
  try {
    let hasMore = true;
    let continuationToken: string | undefined;

    while (hasMore) {
      let listUrlStr = '';
      if (isAws) {
        listUrlStr = `https://${c.env.S3_BUCKET_NAME}.s3.${c.env.S3_REGION}.amazonaws.com/?list-type=2&prefix=${encodeURIComponent(prefix)}`;
      } else {
        listUrlStr = `${endpoint}/${c.env.S3_BUCKET_NAME}?list-type=2&prefix=${encodeURIComponent(prefix)}`;
      }
      
      if (continuationToken) {
        listUrlStr += `&continuation-token=${encodeURIComponent(continuationToken)}`;
      }

      const listUrl = new URL(listUrlStr);
      const listReq = await aws.sign(listUrl, { method: 'GET' });
      const listRes = await fetch(listReq);
      
      if (!listRes.ok) {
        console.error("Failed to list objects in S3", await listRes.text());
        throw new Error("S3 List Failed");
      }

      const xmlText = await listRes.text();
      
      // Simple regex extraction for XML (sufficient for this use case to avoid large XML parser dependencies)
      const keys = [...xmlText.matchAll(/<Key>(.*?)<\/Key>/g)].map(m => m[1]);
      const isTruncatedMatch = xmlText.match(/<IsTruncated>(true|false)<\/IsTruncated>/);
      hasMore = isTruncatedMatch ? isTruncatedMatch[1] === 'true' : false;
      const nextTokenMatch = xmlText.match(/<NextContinuationToken>(.*?)<\/NextContinuationToken>/);
      continuationToken = nextTokenMatch ? nextTokenMatch[1] : undefined;

      // Delete objects individually (simpler than building Delete XML payload for S3)
      for (const key of keys) {
        let deleteUrlStr = '';
        if (isAws) {
          deleteUrlStr = `https://${c.env.S3_BUCKET_NAME}.s3.${c.env.S3_REGION}.amazonaws.com/${encodeURIComponent(key)}`;
        } else {
          deleteUrlStr = `${endpoint}/${c.env.S3_BUCKET_NAME}/${encodeURIComponent(key)}`;
        }
        
        const deleteUrl = new URL(deleteUrlStr);
        const delReq = await aws.sign(deleteUrl, { method: 'DELETE' });
        await fetch(delReq); // Best effort, ignore failures for now
      }
    }
  } catch (error) {
    console.error("S3 Cleanup Error:", error);
    // Proceed to delete from DB even if S3 fails partially
  }

  // 4. Delete project from DB
  await db.delete(projects).where(eq(projects.id, projectId)).run();

  return c.json({ success: true, deletedProjectId: projectId });
});
