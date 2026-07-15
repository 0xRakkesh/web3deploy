import pc from 'picocolors';
import { Command } from 'commander';
import { config } from '../config.js';
import boxen from 'boxen';

export default async function deploy() {
  const token = config.get('token');

  if (!token) {
    console.log('')
    console.log(boxen(pc.red('Not logged in. Run `w3deploy login` first.'), { padding: 1, borderColor: 'redBright' }));
    process.exit(1);
  }

  console.log('');
  console.log(pc.dim(`Authenticated using token: ${token.slice(0, 8)}...`));

  // TODO: Implement actual deploy logic
}
