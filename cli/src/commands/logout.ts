import pc from 'picocolors';
import { intro, confirm, outro, cancel, isCancel } from '@clack/prompts';
import { config } from '../config.js';
import boxen from 'boxen';

const API_URL = process.env.W3DEPLOY_API_URL || 'https://api-server.rakesh904664.workers.dev';

export default async function logout() {
  console.log('');
  const token = config.get('token');

  if (!token) {
    console.log();
    console.log(boxen(pc.yellow('You are not currently logged in.'), { padding: 1, borderColor: 'yellow' }));
    process.exit(0);
  }

  intro(pc.bgRed(pc.black(' Logout ')));

  const shouldLogout = await confirm({
    message: 'Are you sure you want to log out?',
  });

  if (isCancel(shouldLogout) || !shouldLogout) {
    cancel('Logout cancelled.');
    process.exit(0);
  }
  // Revoke token server-side
  try {
    await fetch(`${API_URL}/api/cli/auth/logout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  } catch (e) {
    // Ignore network errors — still clear the local token
  }

  config.delete('token');
  outro(pc.red('Logged out successfully.'));
  process.exit(0);
}
