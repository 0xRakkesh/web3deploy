import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { CloudflareBindings } from "../index";
import { getDB } from "../db";
import { projects, deployments, users } from "../db/schema";
import { eq } from "drizzle-orm";

const createProjectSchema = z.object({
  project_id: z.string().min(3).max(15),
  github_repo: z.string().url(),
  framework: z.string(),
  build_command: z.string(),
  install_command: z.string(),
  output_dir: z.string(),
  root_dir: z.string().optional().default('/'),
  env_vars: z.record(z.string(), z.string()).optional(),
});

const projectsRouter = new Hono<{ Bindings: CloudflareBindings }>();

projectsRouter.post('/', zValidator('json', createProjectSchema), async (c) => {
  const body = c.req.valid('json');
  const db = getDB(c.env);
  
  const jwtPayload = c.get('jwtPayload') as { user_id: string };
  const user_id = jwtPayload.user_id;

  try {
    const [existingUser] = await db.select().from(users).where(eq(users.id, user_id));
    if (!existingUser) {
      return c.json({ error: "Invalid user: This user does not exist in our database." }, 404);
    }

    if (!body.github_repo.startsWith("https://github.com/")) {
      return c.json({ error: "Invalid repository: Only github.com URLs are allowed." }, 400);
    }

    const repoCheck = await fetch(body.github_repo);
    if (!repoCheck.ok) {
      return c.json({ error: "Invalid repository: The GitHub URL does not exist or is private." }, 400);
    }

    const [existingProject] = await db.select().from(projects).where(eq(projects.project_id, body.project_id));
    if (existingProject) {
      return c.json({ error: "Conflict: A project with this ID already exists." }, 409);
    }

    const [project] = await db.insert(projects).values({
      project_id: body.project_id,
      user_id: user_id,
      github_repo: body.github_repo,
      framework: body.framework,
      build_command: body.build_command,
      install_command: body.install_command,
      output_dir: body.output_dir,
      root_dir: body.root_dir,
      env_vars: body.env_vars ? JSON.stringify(body.env_vars) : null,
    }).returning();

    const [deployment] = await db.insert(deployments).values({
      project_id: project.id,
      user_id: user_id,
      status: 'queued',
      commit_hash: 'initial',
    }).returning();

    // TRIGGER GITHUB ACTIONS BUILD ASYNCHRONOUSLY
    const githubToken = c.env.GITHUB_TOKEN;
    const githubOrgRepo = c.env.GITHUB_ORG_REPO || '0xRakkesh/web3deploy';

    if (githubToken) {
      const triggerPromise = fetch(`https://api.github.com/repos/${githubOrgRepo}/actions/workflows/build.yml/dispatches`, {
        method: 'POST',
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'w3deploy-api-server'
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: {
            projectId: body.project_id,
            deploymentId: deployment.id,
            gitRepoUrl: body.github_repo,
            rootDir: body.root_dir || '',
            framework: body.framework || '',
            installCommand: body.install_command || '',
            buildCommand: body.build_command || '',
            outputDir: body.output_dir || '',
            envVars: body.env_vars ? JSON.stringify(body.env_vars) : ''
          }
        })
      }).then(async (response) => {
        if (!response.ok) {
          console.error(`[deploy] GitHub Actions trigger failed: ${response.status} ${await response.text()}`);
        } else {
          console.log(`[deploy] Successfully triggered GitHub Actions for ${body.project_id}`);
        }
      }).catch(err => {
        console.error(`[deploy] Error calling GitHub API:`, err);
      });

      c.executionCtx.waitUntil(triggerPromise);
    } else {
      console.warn("[deploy] Missing GITHUB_TOKEN in env! Build will not be triggered.");
    }
    
    return c.json({ 
      message: "Project created successfully!",
      project,
      deployment
    }, 201);
  } catch (error) {
    console.error("Database error:", error);
    return c.json({ error: "Failed to create project" }, 500);
  }
});

export default projectsRouter;
