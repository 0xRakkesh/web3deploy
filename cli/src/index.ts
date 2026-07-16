#!/usr/bin/env node
import { Command } from 'commander';
import login from './commands/login.js';
import logout from './commands/logout.js';
import deploy from './commands/deploy.js';
import init from './commands/init.js';
import projects from './commands/projects.js';
import pc from 'picocolors';

const program = new Command();

const BANNER_WIDTH = 72;
const terminalWidth = process.stdout.columns || BANNER_WIDTH;

const fullBanner = `
${pc.cyan('█   █ ████  ████  █████ ████  █      ███  █   █ ')}
${pc.cyan('█   █     █ █   █ █     █   █ █     █   █  █ █  ')}
${pc.cyan('█ █ █  ███  █   █ ████  ████  █     █   █   █   ')}
${pc.cyan('██ ██     █ █   █ █     █     █     █   █   █   ')}
${pc.cyan('█   █ ████  ████  █████ █     █████  ███    █   ')}
`;

const compactBanner = `
  ${pc.bgCyan(pc.black(' w3deploy '))} ${pc.cyan('— Deploy your frontend')}
`;

const banner = terminalWidth >= BANNER_WIDTH ? fullBanner : compactBanner;
console.log(banner);


program
  .name('w3deploy')
  .description('A CLI tool to deploy your frontend')
  .version('1.0.0');

program
  .command('init')
  .description('Initialize w3deploy in your project')
  .action(init);

program
  .command('login')
  .description('Login to your account')
  .action(login);

program
  .command('logout')
  .description('Logout from your account')
  .action(logout);

program
  .command('deploy')
  .description('Deploy your frontend')
  .action(deploy);

program
  .command('projects')
  .description('View and manage your deployed projects')
  .action(projects);

program.parse();