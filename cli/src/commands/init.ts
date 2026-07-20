import * as p from '@clack/prompts';
import fs from 'fs';
import path from 'path';
import pc from 'picocolors';

const CONFIG_FILE = 'w3deploy.json';

const PACKAGE_MANAGERS = {
  pnpm: {
    lockfiles: ["pnpm-lock.yaml"],
    install: "pnpm install",
    build: "pnpm run build"
  },
  yarn: {
    lockfiles: ["yarn.lock"],
    install: "yarn install",
    build: "yarn build"
  },
  bun: {
    lockfiles: ["bun.lock", "bun.lockb"],
    install: "bun install",
    build: "bun run build"
  },
  npm: {
    lockfiles: ["package-lock.json"],
    install: "npm install",
    build: "npm run build"
  }
};

const FRAMEWORKS = {
  "react-vite": {
    priority: 100,
    detect: {
      dependencies: ["react"],
      devDependencies: ["vite"]
    },
    outputDir: "dist"
  },
  "react-cra": {
    priority: 90,
    detect: {
      dependencies: ["react", "react-dom"],
      dependenciesAny: ["react-scripts"]
    },
    outputDir: "build"
  },
  "vue": {
    priority: 80,
    detect: {
      dependencies: ["vue"]
    },
    outputDir: "dist"
  },
  "angular": {
    priority: 70,
    detect: {
      dependencies: ["@angular/core"]
    },
    outputDir: "dist"
  },
  "svelte": {
    priority: 60,
    detect: {
      dependencies: ["svelte"]
    },
    outputDir: "build"
  },
  "astro": {
    priority: 50,
    detect: {
      dependencies: ["astro"]
    },
    outputDir: "dist"
  }
};

const FALLBACK_OUTPUT_DIRS = ["dist", "build", "out", "public"];

function detectPackageManager() {
  for (const [pm, config] of Object.entries(PACKAGE_MANAGERS)) {
    for (const lockfile of config.lockfiles) {
      if (fs.existsSync(path.join(process.cwd(), lockfile))) {
        return { name: pm, config };
      }
    }
  }
  return { name: 'npm', config: PACKAGE_MANAGERS.npm };
}

function checkDeps(pkg: any, depList: string[], type: 'dependencies' | 'devDependencies') {
  if (!depList || depList.length === 0) return true;
  const targetDeps = pkg[type] || {};
  return depList.every(dep => !!targetDeps[dep]);
}

function checkDepsAny(pkg: any, depList: string[]) {
  if (!depList || depList.length === 0) return true;
  const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  return depList.some(dep => !!allDeps[dep]);
}

function detectFramework(pkg: any) {
  // Convert hashmap to array and sort by priority descending
  const sortedFrameworks = Object.entries(FRAMEWORKS).sort((a, b) => b[1].priority - a[1].priority);

  for (const [name, framework] of sortedFrameworks) {
    const { detect } = framework;
    let isMatch = true;

    if (detect.dependencies && !checkDeps(pkg, detect.dependencies, 'dependencies')) isMatch = false;
    if (detect.dependencies && !checkDeps(pkg, detect.dependencies, 'devDependencies')) isMatch = false;
    if ((detect as any).dependenciesAny && !checkDepsAny(pkg, (detect as any).dependenciesAny)) isMatch = false;

    if (isMatch) {
      return { name, config: framework };
    }
  }
  return null;
}

export default async function init() {
  console.log();
  p.intro(pc.bgGreenBright(pc.black(' W3deploy init ')));

  if (fs.existsSync(path.join(process.cwd(), CONFIG_FILE))) {
    const overwrite = await p.confirm({
      message: `${pc.magentaBright(CONFIG_FILE)} already exists. Do you want to overwrite it?`,
      initialValue: false
    });

    if (p.isCancel(overwrite) || !overwrite) {
      p.outro(pc.redBright('Operation cancelled.'));
      process.exit(0);
    }
  }

  const defaultProjectName = path.basename(process.cwd());

  const projectName = await p.text({
    message: 'What is your project name?',
    placeholder: defaultProjectName,
    initialValue: defaultProjectName,
  });

  if (p.isCancel(projectName)) {
    p.outro(pc.redBright('Operation cancelled.'));
    process.exit(0);
  }

  const s = p.spinner();
  s.start('Analyzing project structure...');

  let pkg = {};
  const pkgPath = path.join(process.cwd(), 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    } catch (e) {
      s.stop('Failed to parse package.json');
      process.exit(1);
    }
  }

  const packageManager = detectPackageManager();
  const detectedFramework = detectFramework(pkg);

  s.stop(`Detected package manager: ${pc.cyan(packageManager.name)}`);

  const frameworkOptions = Object.keys(FRAMEWORKS).map(key => ({
    value: key,
    label: key === detectedFramework?.name ? `${key} ${pc.green('(detected)')}` : key,
  }));
  frameworkOptions.push({ value: 'other', label: 'Other / Manual' });

  const selectedFrameworkName = await p.select({
    message: 'Which framework are you using?',
    options: frameworkOptions,
    initialValue: detectedFramework ? detectedFramework.name : 'other',
  });

  if (p.isCancel(selectedFrameworkName)) {
    p.outro(pc.redBright('Operation cancelled.'));
    process.exit(0);
  }

  const selectedFrameworkConfig = selectedFrameworkName !== 'other'
    ? (FRAMEWORKS as any)[selectedFrameworkName]
    : null;

  const defaultOutputDir = selectedFrameworkConfig ? selectedFrameworkConfig.outputDir : 'dist';

  const outputDirectory = await p.text({
    message: 'What is your output directory?',
    placeholder: defaultOutputDir,
    initialValue: defaultOutputDir,
  });

  if (p.isCancel(outputDirectory)) {
    p.outro(pc.redBright('Operation cancelled.'));
    process.exit(0);
  }

  const installCommand = await p.text({
    message: 'What is your install command?',
    placeholder: packageManager.config.install,
    initialValue: packageManager.config.install,
  });

  if (p.isCancel(installCommand)) {
    p.outro(pc.redBright('Operation cancelled.'));
    process.exit(0);
  }

  const buildCommand = await p.text({
    message: 'What is your build command?',
    placeholder: packageManager.config.build,
    initialValue: packageManager.config.build,
  });

  if (p.isCancel(buildCommand)) {
    p.outro(pc.redBright('Operation cancelled.'));
    process.exit(0);
  }

  const hasEnvVars = await p.confirm({
    message: 'Do you have any environment variables for your project?',
    initialValue: false
  });

  if (p.isCancel(hasEnvVars)) {
    p.outro(pc.redBright('Operation cancelled.'));
    process.exit(0);
  }

  let envVars: Record<string, string> = {};

  if (hasEnvVars) {
    p.note(pc.yellow('Public variables only. Do NOT enter secrets.'), pc.red('Important'));

    const numVarsStr = await p.text({
      message: 'How many environment variables do you have?',
      validate: (value) => {
        if (!value || !/^\d+$/.test(value) || parseInt(value) <= 0) return 'Please enter a valid positive number';
      }
    });

    if (p.isCancel(numVarsStr)) {
      p.outro(pc.redBright('Operation cancelled.'));
      process.exit(0);
    }

    const numVars = parseInt(numVarsStr as string);

    for (let i = 0; i < numVars; i++) {
      const name = await p.text({
        message: `Variable ${i + 1} Name:`,
        validate: (value) => {
          if (!value || !value.trim()) return 'Name cannot be empty';
        }
      });

      if (p.isCancel(name)) {
        p.outro(pc.redBright('Operation cancelled.'));
        process.exit(0);
      }

      const val = await p.text({
        message: `Variable ${i + 1} Value:`,
      });

      if (p.isCancel(val)) {
        p.outro(pc.redBright('Operation cancelled.'));
        process.exit(0);
      }

      envVars[(name as string).trim()] = (val as string).trim();
    }
  }

  let rewrites: { source: string, destination: string }[] = [];

  const hasRewrites = await p.confirm({
    message: 'Do you want to configure API rewrites/proxies (to avoid CORS)?',
    initialValue: false
  });

  if (p.isCancel(hasRewrites)) {
    p.outro(pc.redBright('Operation cancelled.'));
    process.exit(0);
  }

  if (hasRewrites) {
    p.note(pc.yellow('Example: Source: /api/* -> Destination: https://api.mybackend.com/*'), pc.cyan('Rewrites'));

    const numRewritesStr = await p.text({
      message: 'How many rewrite rules do you want to add?',
      validate: (value) => {
        if (!value || !/^\d+$/.test(value) || parseInt(value) <= 0) return 'Please enter a valid positive number';
      }
    });

    if (p.isCancel(numRewritesStr)) {
      p.outro(pc.redBright('Operation cancelled.'));
      process.exit(0);
    }

    const numRewrites = parseInt(numRewritesStr as string);

    for (let i = 0; i < numRewrites; i++) {
      const source = await p.text({
        message: `Rewrite ${i + 1} Source (e.g., /api/*):`,
        validate: (value) => {
          if (!value || !value.trim()) return 'Source cannot be empty';
        }
      });

      if (p.isCancel(source)) {
        p.outro(pc.redBright('Operation cancelled.'));
        process.exit(0);
      }

      const destination = await p.text({
        message: `Rewrite ${i + 1} Destination (e.g., https://backend.com/*):`,
        validate: (value) => {
          if (!value || !value.trim()) return 'Destination cannot be empty';
        }
      });

      if (p.isCancel(destination)) {
        p.outro(pc.redBright('Operation cancelled.'));
        process.exit(0);
      }

      rewrites.push({ source: (source as string).trim(), destination: (destination as string).trim() });
    }
  }

  const config = {
    projectName,
    outputDirectory,
    installCommand,
    buildCommand,
    framework: selectedFrameworkName !== 'other' ? selectedFrameworkName : null,
    packageManager: packageManager.name,
    env: envVars,
    rewrites
  };

  fs.writeFileSync(
    path.join(process.cwd(), CONFIG_FILE),
    JSON.stringify(config, null, 2)
  );

  p.outro(`✅ Successfully created ${pc.green(CONFIG_FILE)}!`);
}
