import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { FloorLike, ServiceInfo, ServicesProvider } from './types.js';
import type { OpenFoxClient } from './client.js';

export function parseCompactTableString<T = Record<string, unknown>>(input: string): T[] {
  if (typeof input !== 'string') return [];
  const trimmed = input.trim();
  if (!trimmed) return [];

  const firstLineEnd = trimmed.indexOf('\n');
  const headerLine = firstLineEnd === -1 ? trimmed : trimmed.slice(0, firstLineEnd);
  const headerMatch = headerLine.match(/^\[\d+\]\{([^}]+)\}/);
  if (!headerMatch) return [];

  const schemaCols = headerMatch[1]!.split(',').map((c) => {
    const [name, type] = c.split(':');
    return { name: name!.trim(), type: type?.trim() || 'string' };
  });

  const rest = firstLineEnd === -1 ? '' : trimmed.slice(firstLineEnd + 1);
  if (!rest.trim()) return [];

  const rows: string[][] = [];
  let curRow: string[] = [];
  let curField = '';
  let inQuotes = false;
  let bracketDepth = 0;
  let i = 0;

  while (i < rest.length) {
    const ch = rest[i];
    if (inQuotes) {
      if (ch === '\\' && i + 1 < rest.length && rest[i + 1] === '"') {
        curField += '"';
        i += 2;
        continue;
      }
      if (ch === '"') {
        if (i + 1 < rest.length && rest[i + 1] === '"') {
          curField += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        curField += ch;
        i++;
      }
    } else {
      if (ch === '"' && curField.length === 0) {
        inQuotes = true;
        i++;
      } else if (ch === '[' || ch === '{') {
        bracketDepth++;
        curField += ch;
        i++;
      } else if (ch === ']' || ch === '}') {
        bracketDepth = Math.max(0, bracketDepth - 1);
        curField += ch;
        i++;
      } else if (ch === ',' && bracketDepth === 0) {
        curRow.push(curField);
        curField = '';
        i++;
      } else if ((ch === '\n' || (ch === '\r' && rest[i + 1] === '\n')) && bracketDepth === 0) {
        if (ch === '\r') i++;
        curRow.push(curField);
        curField = '';
        if (curRow.length > 0 && curRow.some((f) => f.trim() !== '')) {
          rows.push(curRow);
        }
        curRow = [];
        i++;
      } else {
        curField += ch;
        i++;
      }
    }
  }
  if (curField !== '' || curRow.length > 0) {
    curRow.push(curField);
    if (curRow.some((f) => f.trim() !== '')) {
      rows.push(curRow);
    }
  }

  return rows.map((row) => {
    const obj: Record<string, unknown> = {};
    schemaCols.forEach((col, idx) => {
      let val = row[idx];
      if (val === undefined || val === '') {
        obj[col.name] = undefined;
        return;
      }
      if (col.type.startsWith('json')) {
        try {
          obj[col.name] = JSON.parse(val);
        } catch {
          try {
            const unescaped = val.replace(/""/g, '"');
            obj[col.name] = JSON.parse(unescaped);
          } catch {
            obj[col.name] = val;
          }
        }
      } else if (col.type.startsWith('bool')) {
        obj[col.name] = val === 'true' || val === '1';
      } else if (col.type.startsWith('int') || col.type.startsWith('number')) {
        obj[col.name] = Number(val);
      } else {
        obj[col.name] = val;
      }
    });
    return obj as T;
  });
}

export function extractPortFromCommand(command: string): number | undefined {
  if (!command) return undefined;
  const envMatch = command.match(/\b[A-Za-z0-9_]*PORT\s*=\s*(\d{2,5})\b/i);
  if (envMatch && envMatch[1]) {
    const p = parseInt(envMatch[1], 10);
    if (p > 0 && p < 65536) return p;
  }
  const flagMatch = command.match(/(?:--port|-p)(?:\s+|=)(\d{2,5})\b/i);
  if (flagMatch && flagMatch[1]) {
    const p = parseInt(flagMatch[1], 10);
    if (p > 0 && p < 65536) return p;
  }
  const urlMatch = command.match(/https?:\/\/(?:localhost|127\.0\.0\.1):(\d{2,5})\b/i);
  if (urlMatch && urlMatch[1]) {
    const p = parseInt(urlMatch[1], 10);
    if (p > 0 && p < 65536) return p;
  }
  return undefined;
}

export function cleanServiceName(name?: string): string | undefined {
  if (!name) return undefined;
  return name.replace(/\s*\[[^\]]*\]\s*/g, ' ').replace(/\s*\([^)]*\)\s*$/, '').trim() || name;
}

interface MultiRepoProject {
  name?: string;
  path?: string;
  dir?: string;
  port?: number;
  dev?: unknown;
  servers?: unknown;
  commands?: unknown;
  scripts?: unknown;
  command?: string;
  start?: string;
}

export interface MultiRepoDevItem {
  id: string;
  name?: string;
  projectName: string;
  command: string;
  port?: number;
  kind?: 'server' | 'command';
  status?: 'running' | 'stopped' | 'error';
  relativePath?: string;
  absolutePath?: string;
  logCount?: number;
}

function parseMultiRepoFile(floorDir: string): MultiRepoDevItem[] {
  const filePath = path.join(floorDir, '.openfox', 'openfox-multi-repo.json');
  if (!existsSync(filePath)) return [];
  try {
    const content = readFileSync(filePath, 'utf8');
    let rawProjects: Array<string | MultiRepoProject> = [];

    if (content.trim().startsWith('[')) {
      rawProjects = parseCompactTableString<MultiRepoProject>(content);
    } else {
      const parsed = JSON.parse(content) as {
        projects?: Array<string | MultiRepoProject> | string;
      };
      if (Array.isArray(parsed?.projects)) {
        rawProjects = parsed.projects;
      } else if (typeof parsed?.projects === 'string') {
        rawProjects = parseCompactTableString<MultiRepoProject>(parsed.projects);
      }
    }

    if (!rawProjects || rawProjects.length === 0) return [];

    const items: MultiRepoDevItem[] = [];

    for (const p of rawProjects) {
      if (typeof p === 'string') {
        const name = path.basename(p) || p;
        items.push({
          id: `${name}:server:0:dev`,
          name,
          projectName: name,
          command: 'npm run dev',
          port: undefined,
          kind: 'server',
          status: 'stopped',
        });
        continue;
      }
      if (p && typeof p === 'object') {
        const projectName = p.name || 'project';
        const projectPath = p.path || p.dir || '.';
        const candidateEntries: Array<{ name?: string; command: string; port?: number }> = [];

        if (typeof p.dev === 'string' && p.dev.trim()) {
          candidateEntries.push({ command: p.dev.trim(), port: p.port });
        } else if (Array.isArray(p.dev)) {
          for (const item of p.dev) {
            if (typeof item === 'string' && item.trim()) {
              candidateEntries.push({ command: item.trim(), port: p.port });
            } else if (item && typeof item === 'object') {
              const cmd = (item as any).command || (item as any).cmd || (item as any).dev || (item as any).script;
              if (typeof cmd === 'string' && cmd.trim()) {
                candidateEntries.push({
                  name: (item as any).name,
                  command: cmd.trim(),
                  port: typeof (item as any).port === 'number' ? (item as any).port : p.port,
                });
              }
            }
          }
        }

        if (Array.isArray(p.servers)) {
          for (const item of p.servers) {
            if (item && typeof item === 'object') {
              const cmd = (item as any).command || (item as any).cmd;
              if (typeof cmd === 'string' && cmd.trim()) {
                candidateEntries.push({
                  name: (item as any).name,
                  command: cmd.trim(),
                  port: typeof (item as any).port === 'number' ? (item as any).port : p.port,
                });
              }
            }
          }
        }

        if (candidateEntries.length === 0 && (p.command || p.start)) {
          const cmd = (p.command || p.start)!.trim();
          candidateEntries.push({ command: cmd, port: p.port });
        }

        if (candidateEntries.length === 0) {
          const subDevJson = path.join(floorDir, projectPath, '.openfox', 'dev.json');
          if (existsSync(subDevJson)) {
            try {
              const subConf = JSON.parse(readFileSync(subDevJson, 'utf8'));
              if (subConf.command) {
                candidateEntries.push({
                  command: subConf.command,
                  port: typeof subConf.port === 'number' ? subConf.port : undefined,
                });
              }
            } catch {}
          }
        }

        for (let i = 0; i < candidateEntries.length; i++) {
          const entry = candidateEntries[i]!;
          const detectedPort = entry.port ?? extractPortFromCommand(entry.command);
          const svcName = entry.name || (candidateEntries.length === 1 ? projectName : `server-${i + 1}`);
          items.push({
            id: `${projectName}:server:${i}:${svcName}`,
            name: svcName,
            projectName,
            command: entry.command,
            port: detectedPort,
            kind: 'server',
            status: 'stopped',
          });
        }

        // Parse commands and scripts
        const candidateCommandEntries: Array<{ name?: string; command: string }> = [];
        const rawCmds = p.commands ?? p.scripts;
        if (typeof rawCmds === 'string' && rawCmds.trim()) {
          candidateCommandEntries.push({ command: rawCmds.trim() });
        } else if (Array.isArray(rawCmds)) {
          for (const item of rawCmds) {
            if (typeof item === 'string' && item.trim()) {
              candidateCommandEntries.push({ command: item.trim() });
            } else if (item && typeof item === 'object') {
              const cmd = (item as any).command || (item as any).cmd || (item as any).script;
              if (typeof cmd === 'string' && cmd.trim()) {
                candidateCommandEntries.push({
                  name: (item as any).name,
                  command: cmd.trim(),
                });
              }
            }
          }
        }
        for (let i = 0; i < candidateCommandEntries.length; i++) {
          const entry = candidateCommandEntries[i]!;
          const cmdName = entry.name || (candidateCommandEntries.length === 1 ? 'cmd' : `cmd-${i + 1}`);
          items.push({
            id: `${projectName}:command:${i}:${cmdName}`,
            name: cmdName,
            projectName,
            command: entry.command,
            port: 0,
            kind: 'command',
            status: 'stopped',
          });
        }
      }
    }

    return items;
  } catch {
    return [];
  }
}

export class OpenFoxServicesProvider implements ServicesProvider {
  private client: OpenFoxClient;

  constructor(client: OpenFoxClient) {
    this.client = client;
  }

  async listServices(floor: FloorLike): Promise<ServiceInfo[]> {
    const list: ServiceInfo[] = [];

    try {
      const multiRepoConfigPath = path.join(floor.dir, '.openfox', 'openfox-multi-repo.json');
      const isMultiRepo = existsSync(multiRepoConfigPath);

      if (isMultiRepo) {
        let items: MultiRepoDevItem[] = (await this.client.getMultiRepoServices(floor.dir)) ?? [];

        if (items.length === 0) {
          items = parseMultiRepoFile(floor.dir);
        }

        for (const s of items) {
          const isServer = s.kind === 'server' || !s.kind;
          const isRunning = s.status === 'running';
          const port = isServer ? (s.port ?? extractPortFromCommand(s.command) ?? 0) : 0;
          const displayName = s.name && s.name !== s.projectName
            ? `${s.projectName} › ${s.name}`
            : s.name || s.projectName;

          const title = isServer
            ? `${displayName} (${isRunning ? 'Running' : 'Stopped'})`
            : `${displayName} [task] (${isRunning ? 'Running' : 'Ready'})`;

          list.push({
            port,
            host: 'localhost',
            pid: 0,
            command: s.command,
            workerId: isRunning ? 'dev-server' : 'dev-server-stopped',
            cwd: floor.dir,
            title,
            since: 0,
          });
        }

        if (list.length > 0) {
          return list;
        }
      }

      const devJsonPath = path.join(floor.dir, '.openfox', 'dev.json');
      const hasDevConfig = existsSync(devJsonPath);
      const devServer = await this.client.getDevServer(floor.dir);

      const isRunning =
        devServer?.state === 'running' ||
        devServer?.state === 'starting' ||
        devServer?.status === 'running' ||
        Boolean(devServer?.port && devServer.port > 0);

      if (isRunning || hasDevConfig || devServer?.config || devServer?.url) {
        let port = devServer?.port || 0;
        const targetUrl = devServer?.url || devServer?.config?.url;
        if (!port && targetUrl) {
          try {
            const parsed = new URL(targetUrl);
            port = Number(parsed.port) || 0;
          } catch {
            const match = targetUrl.match(/:(\d+)/);
            if (match && match[1]) port = Number(match[1]);
          }
        }
        if (!port && devServer?.command) {
          port = extractPortFromCommand(devServer.command) || 0;
        }

        const stateLabel =
          devServer?.state === 'starting'
            ? 'Dev Server (Starting…)'
            : isRunning
              ? 'Dev Server (Running)'
              : 'Dev Server (Stopped)';

        list.push({
          port,
          host: 'localhost',
          pid: 0,
          command: devServer?.command || devServer?.config?.command || 'Dev Server',
          workerId: isRunning ? 'dev-server' : 'dev-server-stopped',
          cwd: floor.dir,
          title: stateLabel,
          since: 0,
        });
      }
    } catch {
      // ignore
    }

    return list;
  }

  async startService(floor: FloorLike, serviceName?: string): Promise<void> {
    const multiRepoConfigPath = path.join(floor.dir, '.openfox', 'openfox-multi-repo.json');
    if (existsSync(multiRepoConfigPath)) {
      const cleanName = cleanServiceName(serviceName);
      await this.client.startMultiRepoService(floor.dir, cleanName);
      return;
    }
    await this.client.startDevServer(floor.dir);
  }

  async stopService(floor: FloorLike, serviceName?: string): Promise<void> {
    const multiRepoConfigPath = path.join(floor.dir, '.openfox', 'openfox-multi-repo.json');
    if (existsSync(multiRepoConfigPath)) {
      const cleanName = cleanServiceName(serviceName);
      await this.client.stopMultiRepoService(floor.dir, cleanName);
      return;
    }
    await this.client.stopDevServer(floor.dir);
  }

  async getServiceLogs(floor: FloorLike, serviceName?: string): Promise<string[]> {
    const multiRepoConfigPath = path.join(floor.dir, '.openfox', 'openfox-multi-repo.json');
    if (existsSync(multiRepoConfigPath)) {
      const cleanName = cleanServiceName(serviceName);
      return await this.client.getMultiRepoLogs(floor.dir, cleanName);
    }
    return await this.client.getDevServerLogs(floor.dir);
  }
}
