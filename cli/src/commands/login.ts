import pc from 'picocolors';
import { intro, spinner, text, note, outro } from '@clack/prompts';
import open from 'open';

import { config } from '../config.js';

const API_URL = process.env.W3DEPLOY_API_URL || 'http://localhost:8787';

export default async function login() {
  console.log('')
  intro(pc.bgGreen(pc.black(' Login ')));
  const s = spinner();
  s.start('Initializing authentication...');

  try {
    const res = await fetch(`${API_URL}/api/cli/auth/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`Failed to initialize auth: ${res.statusText}`);
    }

    const { deviceCode, userCode, verificationUri } = await res.json() as any;

    s.stop(`🔒 Authentication initialized.`);

    s.start('Opening browser automatically...');

    // Wait for 2 seconds before opening so the user can read the CLI
    await new Promise(resolve => setTimeout(resolve, 2000));
    await open(`${verificationUri}?code=${userCode}`);

    s.message('Waiting for browser authentication...');

    // Poll every 3 seconds
    let token: string | null = null;
    while (!token) {
      await new Promise(resolve => setTimeout(resolve, 3000));

      const pollRes = await fetch(`${API_URL}/api/cli/auth/poll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceCode }),
      });
      const data = await pollRes.json() as any;

      if (pollRes.ok && data.token) {
        token = data.token;
      } else if (pollRes.ok && data.status === 'pending') {
        // Keep waiting
        continue;
      } else {
        throw new Error(data.error || 'Authentication failed or expired.');
      }
    }

    s.stop('✅ Authenticated');

    // Save to config
    config.set('token', token);


    outro('Ready to deploy!');

  } catch (error: any) {
    s.stop('Authentication failed.');
    console.error(pc.red(`\nError: ${error.message}`));
    process.exit(1);
  }
}
