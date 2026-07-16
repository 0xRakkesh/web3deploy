import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDB } from "../db/index.js";
import { projects } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { AwsClient } from "aws4fetch";
import { CloudflareBindings, Variables } from "../index.js";

export const cliDeployRouter = new Hono<{ Bindings: CloudflareBindings, Variables: Variables }>();

const deployInitSchema = z.object({
  requestedSlug: z.string(),
  files: z.array(z.object({
    path: z.string(),
    contentType: z.string(),
  }))
});

cliDeployRouter.post('/init', zValidator('json', deployInitSchema), async (c) => {
  const { requestedSlug, files } = c.req.valid('json');
  const authUser = c.get('authUser');
  
  if (!authUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const db = getDB(c.env);
  let finalSlug = requestedSlug;
  
  // 1. Check if project exists
  let project = await db.select().from(projects).where(eq(projects.name, requestedSlug)).get();
  
  if (project) {
    if (project.user_id !== authUser.user_id) {
      // Slug taken by someone else
      return c.json({ error: `Project name "${requestedSlug}" is already taken. Please choose a different name.` }, 409);
    } else {
      // Update existing project status to building
      const result = await db.update(projects).set({
        status: 'building',
        updated_at: new Date().toLocaleString()
      }).where(eq(projects.id, project.id)).returning().get();
      if (result) {
        project = result;
      }
    }
  } else {
    // Slug is free, create new project
    const result = await db.insert(projects).values({
      name: finalSlug,
      user_id: authUser.user_id,
      status: 'building'
    }).returning().get();
    project = result;
  }

  if (!project) {
    return c.json({ error: "Failed to create or retrieve project" }, 500);
  }

  // 3. Setup AWS Client for S3 signing
  const aws = new AwsClient({
    accessKeyId: c.env.S3_ACCESS_KEY_ID,
    secretAccessKey: c.env.S3_SECRET_ACCESS_KEY,
    service: 's3',
    region: c.env.S3_REGION || 'us-east-1',
  });

  const uploadUrls: Record<string, string> = {};

  // 4. Generate Presigned URLs
  for (const file of files) {
    const objectKey = `__outputs/${finalSlug}/${file.path}`;
    
    // Use virtual-hosted style for AWS S3, and path-style for R2/MinIO
    let url: URL;
    if (c.env.S3_ENDPOINT.includes('.amazonaws.com')) {
      url = new URL(`https://${c.env.S3_BUCKET_NAME}.s3.${c.env.S3_REGION}.amazonaws.com/${objectKey}`);
    } else {
      const endpoint = c.env.S3_ENDPOINT.endsWith('/') ? c.env.S3_ENDPOINT.slice(0, -1) : c.env.S3_ENDPOINT;
      url = new URL(`${endpoint}/${c.env.S3_BUCKET_NAME}/${objectKey}`);
    }
    
    const signedRequest = await aws.sign(url, {
      method: 'PUT',
      headers: {
        'Content-Type': file.contentType
      },
      aws: { signQuery: true } // Presigned URL via query params
    });
    
    uploadUrls[file.path] = signedRequest.url;
  }

  return c.json({
    finalSlug,
    projectId: project.id,
    uploadUrls
  });
});

cliDeployRouter.post('/success', zValidator('json', z.object({ projectId: z.string() })), async (c) => {
  const { projectId } = c.req.valid('json');
  const authUser = c.get('authUser');
  
  if (!authUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const db = getDB(c.env);
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).get();

  if (!project || project.user_id !== authUser.user_id) {
    return c.json({ error: "Project not found or forbidden" }, 403);
  }

  const deploymentUrl = `${project.name}.web3deploy.me`;

  await db.update(projects).set({
    status: 'success',
    deployment_url: deploymentUrl,
    updated_at: new Date().toLocaleString()
  }).where(eq(projects.id, projectId)).run();

  return c.json({ success: true, deploymentUrl });
});
