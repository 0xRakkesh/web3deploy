import pc from 'picocolors';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import slugify from '@sindresorhus/slugify';
import mime from 'mime-types';
import { config as conf } from '../config.js';
import { render } from 'ink';
import { Dashboard } from '../ui/Dashboard.js';

const API_URL = process.env.W3DEPLOY_API_URL || 'https://api-server.rakesh904664.workers.dev';
const CONFIG_FILE = 'w3deploy.json';
const MAX_UPLOAD_SIZE = 20 * 1024 * 1024; // 20 MB

let inkInstance: ReturnType<typeof render> | null = null;
let dashboardState = {
  framework: 'Unknown',
  packageManager: 'Unknown',
  status: 'Starting...',
  progressPercent: 0,
  logs: [] as string[]
};

function updateDashboard(newState: Partial<typeof dashboardState>) {
  dashboardState = { ...dashboardState, ...newState };
  if (!inkInstance) {
    inkInstance = render(<Dashboard {...dashboardState} />);
  } else {
    inkInstance.rerender(<Dashboard {...dashboardState} />);
  }
}

function addLog(log: string) {
  const cleanLog = log.trim().replace(/\u001b\[.*?m/g, ''); // strip ansi for cleaner display
  if (!cleanLog) return;
  const newLogs = [...dashboardState.logs, cleanLog].slice(-8); // Keep last 8 lines
  updateDashboard({ logs: newLogs });
}

// Helper to run commands and stream output
function runCommand(command: string, cwd: string, stepName: string, envOverrides: Record<string, string> = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { 
      cwd, 
      shell: true,
      env: { ...process.env, ...envOverrides }
    });

    child.stdout?.on('data', (data) => {
      const lines = data.toString().split('\n').filter(Boolean);
      lines.forEach(addLog);
    });

    child.stderr?.on('data', (data) => {
      const lines = data.toString().split('\n').filter(Boolean);
      lines.forEach(addLog);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${stepName} failed with exit code ${code}`));
      }
    });
  });
}

// Helper to recursively get all files in a directory
function getFiles(dir: string, fileList: string[] = []) {
  if (!fs.existsSync(dir)) return fileList;

  const files = fs.readdirSync(dir);
  for (const file of files) {
    const name = dir + '/' + file;
    if (fs.statSync(name).isDirectory()) {
      getFiles(name, fileList);
    } else {
      fileList.push(name);
    }
  }
  return fileList;
}

export default async function deploy() {
    // 1. Check for config
  const configPath = path.join(process.cwd(), CONFIG_FILE);
  if (!fs.existsSync(configPath)) {
    console.error(pc.redBright(`❌ Error: ${CONFIG_FILE} not found. Please run ${pc.cyan('w3deploy init')} first.`));
    process.exit(1);
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    console.error(pc.redBright(`❌ Error: Could not parse ${CONFIG_FILE}. Is it valid JSON?`));
    process.exit(1);
  }

  const { projectName, outputDirectory, installCommand, buildCommand, env = {} } = config;

  if (!projectName || !outputDirectory || !installCommand || !buildCommand) {
    console.error(pc.redBright(`❌ Error: ${CONFIG_FILE} is missing required fields.`));
    process.exit(1);
  }

  const token = conf.get('token');
  if (!token) {
    console.error(pc.redBright(`❌ Error: You are not logged in. Please run ${pc.cyan('w3deploy login')} first.`));
    process.exit(1);
  }

  // Deduce framework/package loosely from commands if possible
  const packageManager = installCommand.split(' ')[0] || 'npm';
  const framework = config.framework || 'React/Vue'; // if they added it to w3deploy.json

  // Initialize Dashboard
  updateDashboard({
    framework,
    packageManager,
    status: 'Installing Dependencies...'
  });

  // 2. Install Dependencies
  try {
    addLog(`Running: ${installCommand}`);
    await runCommand(installCommand, process.cwd(), 'Install step', env);
    addLog('Dependencies installed successfully.');
  } catch (error: any) {
    if (inkInstance) inkInstance.unmount();
    console.error(pc.redBright(`❌ Install Failed: ${error.message}`));
    process.exit(1);
  }

  // 3. Build Project
  updateDashboard({ status: 'Building...' });
  try {
    addLog(`Running: ${buildCommand}`);
    await runCommand(buildCommand, process.cwd(), 'Build step', env);
    addLog('Project built successfully.');
  } catch (error: any) {
    if (inkInstance) inkInstance.unmount();
    console.error(pc.redBright(`❌ Build Failed: ${error.message}`));
    process.exit(1);
  }

  // 4. Validate output directory and size
  const outPath = path.join(process.cwd(), outputDirectory);
  if (!fs.existsSync(outPath)) {
    if (inkInstance) inkInstance.unmount();
    console.error(pc.redBright(`❌ Error: Output directory "${outputDirectory}" does not exist after building.`));
    process.exit(1);
  }

  updateDashboard({ status: 'Preparing Upload...' });
  addLog('Scanning output directory...');

  const allFiles = getFiles(outPath);
  let totalSize = 0;

  const uploadManifest = allFiles.map(filePath => {
    const stat = fs.statSync(filePath);
    totalSize += stat.size;

    const relativePath = path.relative(outPath, filePath).replace(/\\/g, '/');
    const contentType = mime.lookup(filePath) || 'application/octet-stream';

    return {
      localPath: filePath,
      path: relativePath,
      size: stat.size,
      contentType
    };
  });

  const configStat = fs.statSync(configPath);
  totalSize += configStat.size;
  uploadManifest.push({
    localPath: configPath,
    path: '_w3deploy.json',
    size: configStat.size,
    contentType: 'application/json'
  });

  addLog(`Found ${uploadManifest.length} files (${(totalSize / 1024 / 1024).toFixed(2)} MB).`);

  if (totalSize > MAX_UPLOAD_SIZE) {
    if (inkInstance) inkInstance.unmount();
    console.error(pc.redBright(`❌ Error: Build output is too large (${(totalSize / 1024 / 1024).toFixed(2)} MB). Maximum allowed is 20 MB.`));
    process.exit(1);
  }

  // 5. Slugify project name
  const requestedSlug = slugify(projectName);

  // 6. API Registration
  addLog(`Registering deployment for slug: ${requestedSlug}...`);

  const apiRes = await fetch(`${API_URL}/api/cli/deploy/init`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      requestedSlug,
      files: uploadManifest.map(f => ({ path: f.path, contentType: f.contentType }))
    })
  });

  if (!apiRes.ok) {
    const errorText = await apiRes.text();
    let errorMsg = errorText;
    try { 
      const parsed = JSON.parse(errorText); 
      if (parsed.error) errorMsg = parsed.error;
    } catch(e) {}
    
    if (inkInstance) inkInstance.unmount();
    console.error(pc.redBright(`❌ Error: ${errorMsg}`));
    process.exit(1);
  }

  const deployData = await apiRes.json() as any;
  addLog(`Deployment registered at slug: ${deployData.finalSlug}`);

  // 7. Upload to S3
  updateDashboard({ status: 'Uploading', progressPercent: 0 });
  let uploadedBytes = 0;

  try {
    for (const file of uploadManifest) {
      const uploadUrl = deployData.uploadUrls[file.path];
      if (!uploadUrl) {
         throw new Error(`Missing upload URL for ${file.path}`);
      }

      const fileBuffer = fs.readFileSync(file.localPath);
      addLog(`Uploading ${file.path}...`);

      // Actual S3 Upload
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.contentType,
          'Content-Length': file.size.toString()
        },
        body: fileBuffer
      });

      if (!uploadRes.ok) {
        const errorText = await uploadRes.text();
        throw new Error(`Failed to upload ${file.path}: ${uploadRes.status} ${errorText}`);
      }

      uploadedBytes += file.size;
      const progressPercent = Math.min(100, Math.round((uploadedBytes / totalSize) * 100));
      updateDashboard({ progressPercent });
    }

    updateDashboard({ status: 'Done', progressPercent: 100 });
    addLog('Upload complete!');

    // Give it a second to show the "Done" state in UI
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    addLog('Finalizing deployment status...');
    const successRes = await fetch(`${API_URL}/api/cli/deploy/success`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ projectId: deployData.projectId })
    });

    if (!successRes.ok) {
      console.error(pc.yellow(`\n⚠ Warning: Files uploaded successfully, but could not update status on server.`));
    }

    if (inkInstance) inkInstance.unmount();

    console.log('\n' + `Live URL: ${pc.green(`https://${deployData.finalSlug}.web3deploy.me`)} 🚀`);

  } catch (error: any) {
    if (inkInstance) inkInstance.unmount();
    console.error(pc.redBright(`❌ Error uploading to S3: ${error.message}`));
    process.exit(1);
  }
}
