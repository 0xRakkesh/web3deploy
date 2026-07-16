import React, { useState } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import { config as conf } from '../config.js';
import pc from 'picocolors';

const API_URL = process.env.W3DEPLOY_API_URL || 'http://localhost:8787';
const W = 60;
const INNER = W - 6; // 2 border + 2×2 paddingX = 54

interface Project {
  id: string;
  name: string;
  status: string;
  deploymentUrl: string | null;
  updatedAt: string;
}

function Divider() {
  return <Text color="gray">{'─'.repeat(INNER)}</Text>;
}

function trunc(str: string, max: number) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

// ─── App ─────────────────────────────────────────────────────────────────────
function App({ initialProjects, token }: { initialProjects: Project[]; token: string }) {
  const { exit } = useApp();

  const [view, setView] = useState<'main' | 'deleting' | 'done'>('main');
  const [projects, setProjects] = useState(initialProjects);
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [logs, setLogs] = useState<Array<{ text: string; ok: boolean }>>([]);

  useInput((input, key) => {
    if (view !== 'main') return;

    if (key.upArrow) { setCursor(c => Math.max(0, c - 1)); return; }
    if (key.downArrow) { setCursor(c => Math.min(projects.length - 1, c + 1)); return; }

    // Space: toggle selection on current project
    if (input === ' ') {
      const id = projects[cursor]?.id;
      if (!id) return;
      setSelected(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
      return;
    }

    // Enter: delete selected projects
    if (key.return) {
      if (selected.size > 0) {
        setView('deleting');
        runDelete(Array.from(selected));
      }
      return;
    }

    // Esc: quit
    if (key.escape) { exit(); return; }
  });

  const runDelete = async (ids: string[]) => {
    const newLogs: Array<{ text: string; ok: boolean }> = [];
    for (const id of ids) {
      const name = projects.find(p => p.id === id)?.name ?? id;
      try {
        const res = await fetch(`${API_URL}/api/cli/projects/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        newLogs.push(res.ok
          ? { text: `✅ ${name}`, ok: true }
          : { text: `❌ ${name} (${res.status})`, ok: false }
        );
      } catch (err: any) {
        newLogs.push({ text: `❌ ${name}: ${err.message}`, ok: false });
      }
      setLogs([...newLogs]);
    }
    setProjects(prev => prev.filter(p => !ids.includes(p.id)));
    setSelected(new Set());
    setView('done');
    setTimeout(() => exit(), 2000);
  };

  // ── deleting / done screen ────────────────────────────────────────
  if (view === 'done' || view === 'deleting') {
    const color = view === 'done' ? 'green' : 'yellow';
    const title = view === 'done' ? '✅ Done' : '⟳  Deleting…';
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={2} paddingY={1} width={W}>
        <Text bold color={color}>{title}</Text>
        <Box flexDirection="column" marginTop={1}>
          {logs.map((l, i) => <Text key={i} color={l.ok ? 'green' : 'red'}>{l.text}</Text>)}
        </Box>
      </Box>
    );
  }

  // ── main view ─────────────────────────────────────────────────────
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1} width={W}>

      {/* header */}
      <Box justifyContent="space-between">
        <Text bold color="black" backgroundColor="cyan"> Projects </Text>
        {selected.size > 0 && (
          <Text bold color="red">{selected.size} selected</Text>
        )}
        <Text color="gray"> Esc : quit</Text>
      </Box>

      <Divider />

      {/* rows */}
      {projects.length === 0 ? (
        <Box paddingY={1}>
          <Text color="gray">No projects yet — run </Text>
          <Text color="cyan">w3deploy deploy</Text>
        </Box>
      ) : (
        projects.map((proj, idx) => {
          const active = cursor === idx;
          const checked = selected.has(proj.id);
          const urlText = proj.deploymentUrl
            ? `https://${trunc(proj.deploymentUrl, INNER - 12)}`
            : 'Not deployed yet';

          return (
            <Box key={proj.id} flexDirection="column" marginTop={idx === 0 ? 0 : 1}>
              <Box gap={1}>
                <Text color="cyan">{active ? '❯' : ' '}</Text>
                <Text color={checked ? 'red' : 'white'} bold={active}>
                  {trunc(proj.name, INNER - 6)}{checked ? ' ◉ ' : ''}
                </Text>
              </Box>
              <Box flexDirection="column" paddingLeft={2}>
                <Text color={proj.deploymentUrl ? 'cyan' : 'gray'}>{urlText}</Text>
                <Text color="gray">{proj.updatedAt}</Text>
              </Box>
            </Box>
          );
        })
      )}

      <Divider />
      <Box justifyContent="space-between">
        <Text color="gray">↑↓ : navigate</Text>
        <Text color="gray">Space : select</Text>
        <Text color="gray">Enter : delete</Text>
      </Box>
    </Box>
  );
}

// ─── entrypoint ───────────────────────────────────────────────────────────────
export default async function projectsCmd() {
  const token = conf.get('token') as string | undefined;
  if (!token) {
    console.error(pc.redBright(`❌  Not logged in. Run ${pc.cyan('w3deploy login')} first.`));
    process.exit(1);
  }

  process.stdout.write('Fetching projects…\r');
  let data: { projects: Project[] };
  try {
    const res = await fetch(`${API_URL}/api/cli/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      process.stdout.write('\n');
      console.error(pc.redBright(`❌  API ${res.status}: ${res.statusText}`));
      process.exit(1);
    }
    data = (await res.json()) as { projects: Project[] };
  } catch (err: any) {
    process.stdout.write('\n');
    console.error(pc.redBright(`❌  ${err.message}`));
    process.exit(1);
  }
  process.stdout.write('\r' + ' '.repeat(30) + '\r');

  const { waitUntilExit } = render(<App initialProjects={data!.projects} token={token} />);
  await waitUntilExit();
}
