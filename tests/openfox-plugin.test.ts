import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOpenFoxPlugin, extractPortFromCommand } from '../src/index.js';

function fakeOpenFox(answers: Record<string, unknown>): Promise<{ port: number; close(): Promise<void>; server: Server }> {
  const server = createServer((req, res) => {
    const url = req.url ?? '';
    const key = `${req.method} ${url.split('?')[0]}`;
    const answer = answers[key] ?? (req.method === 'POST' ? { task: { id: 't1' }, project: { id: 'p1' } } : {});
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(answer));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        port,
        server,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

test('OpenFox plugin reads and sorts projects via FloorProvider', async () => {
  const fake = await fakeOpenFox({
    'GET /api/projects': {
      projects: [
        { id: 'a', name: 'alpha', workdir: '/code/alpha' },
        { id: 'b', name: 'beta', workdir: '/code/beta', starred: true },
      ],
    },
  });
  process.env.OPENFOX_PORT = String(fake.port);
  process.env.OPENFOX_TOKEN = 'tok';

  try {
    const plugin = createOpenFoxPlugin();
    assert.equal(plugin.manifest.id, 'openfox');
    assert.ok(plugin.floorProvider);

    const floors = await plugin.floorProvider.listFloors();
    assert.equal(floors.length, 2);
    // Starred first
    assert.equal(floors[0]?.id, 'b');
    assert.equal(floors[1]?.id, 'a');
  } finally {
    delete process.env.OPENFOX_PORT;
    delete process.env.OPENFOX_TOKEN;
    await fake.close();
  }
});

test('OpenFox plugin maps tasks to Issues via IssuesAdapter', async () => {
  const fake = await fakeOpenFox({
    'GET /api/projects/p1/tasks': {
      tasks: [
        { id: 't1', title: 'Task 1', prompt: 'do it', status: 'todo' },
        { id: 't2', title: 'Task 2', prompt: 'in progress', status: 'in_progress', boundSessionId: 's1' },
        { id: 't3', title: 'Task 3', prompt: 'finished task', status: 'done' },
      ],
    },
  });
  process.env.OPENFOX_PORT = String(fake.port);

  try {
    const plugin = createOpenFoxPlugin();
    assert.ok(plugin.issuesAdapter);
    const issues = await plugin.issuesAdapter.listIssues({ id: 'p1', dir: '/code/p1' } as any);
    assert.equal(issues.length, 3);
    assert.equal(issues[0]?.title, 'Task 1');
    assert.equal(issues[0]?.state, 'OPEN');
    assert.equal(issues[0]?.taken, false);

    assert.equal(issues[1]?.title, 'Task 2');
    assert.equal(issues[1]?.state, 'OPEN');
    assert.equal(issues[1]?.taken, true);
    assert.deepEqual(issues[1]?.assignees, ['s1']);

    assert.equal(issues[2]?.title, 'Task 3');
    assert.equal(issues[2]?.state, 'CLOSED');
  } finally {
    delete process.env.OPENFOX_PORT;
    await fake.close();
  }
});

test('OpenFox plugin lists services via ServicesProvider', async () => {
  const fake = await fakeOpenFox({
    'GET /api/dev-server': { status: 'running', port: 5173, url: 'http://localhost:5173' },
  });
  process.env.OPENFOX_PORT = String(fake.port);

  try {
    const plugin = createOpenFoxPlugin();
    const services = await plugin.servicesProvider?.listServices({ id: 'p1', dir: '/code/p1' } as any);
    assert.equal(services?.length, 1);
    assert.equal(services?.[0]?.port, 5173);
    assert.equal(services?.[0]?.workerId, 'dev-server');
  } finally {
    delete process.env.OPENFOX_PORT;
    await fake.close();
  }
});

test('OpenFox plugin provides agent provider with hooksAs claude', () => {
  const plugin = createOpenFoxPlugin();
  assert.ok(plugin.agentProvider);
  assert.equal(plugin.agentProvider.id, 'openfox');
  assert.equal(plugin.agentProvider.adapter.hooksAs, 'claude');
  const plan = plugin.agentProvider.adapter.launch({
    args: ['bin/agent.js'],
    prompt: 'hello world',
    resumeSessionId: 'sess-123',
    floor: {} as any,
  } as any);
  assert.deepEqual(plan.args, ['bin/agent.js', '--resume', 'sess-123', '--', 'hello world']);
});

test('extractPortFromCommand parses ports from environment variables and flags', () => {
  assert.equal(extractPortFromCommand('OPENFOX_PORT=10471 npm run dev'), 10471);
  assert.equal(extractPortFromCommand('PORT=3000 node server.js'), 3000);
  assert.equal(extractPortFromCommand('npm run dev -- --port 5173'), 5173);
  assert.equal(extractPortFromCommand('vite -p 8080'), 8080);
  assert.equal(extractPortFromCommand('http://localhost:4000'), 4000);
  assert.equal(extractPortFromCommand('npm run dev'), undefined);
});

test('OpenFox plugin supports multi-repo configuration via file parsing and RPC', async () => {
  const testDir = join(tmpdir(), `openfox-test-mr-${Date.now()}`);
  const openfoxDir = join(testDir, '.openfox');
  await mkdir(openfoxDir, { recursive: true });

  const config = {
    projects: [
      {
        name: 'openfox',
        path: './openfox',
        dev: [
          {
            name: 'dev',
            command: 'OPENFOX_PORT=10471 npm run dev',
          },
        ],
      },
      {
        name: 'agent-office',
        path: './agent-office',
        dev: 'PORT=4600 npm run dev',
      },
    ],
  };

  await writeFile(join(openfoxDir, 'openfox-multi-repo.json'), JSON.stringify(config, null, 2));

  // 1. Without RPC (direct file fallback)
  try {
    const plugin = createOpenFoxPlugin();
    const services = await plugin.servicesProvider?.listServices({ id: 'p1', dir: testDir } as any);
    assert.ok(services);
    assert.equal(services.length, 2);
    assert.equal(services[0]?.port, 10471);
    assert.equal(services[0]?.title, 'openfox › dev (Stopped)');
    assert.equal(services[0]?.workerId, 'dev-server-stopped');
    assert.equal(services[1]?.port, 4600);
    assert.equal(services[1]?.title, 'agent-office (Stopped)');
  } finally {
    await rm(testDir, { recursive: true, force: true });
  }
});

test('OpenFox plugin supports multi-repo configuration via OpenFox RPC', async () => {
  const testDir = join(tmpdir(), `openfox-test-mr-rpc-${Date.now()}`);
  const openfoxDir = join(testDir, '.openfox');
  await mkdir(openfoxDir, { recursive: true });
  await writeFile(join(openfoxDir, 'openfox-multi-repo.json'), JSON.stringify({ projects: [] }, null, 2));

  const fake = await fakeOpenFox({
    'POST /api/plugins/openfox-multirepo-plugin/rpc/getDevServices': {
      result: {
        services: [
          {
            id: 'openfox:server:0:dev',
            name: 'dev',
            projectName: 'openfox',
            command: 'OPENFOX_PORT=10471 npm run dev',
            port: 10471,
            kind: 'server',
            status: 'running',
            logCount: 15,
          },
          {
            id: 'backend:server:0:api',
            name: 'api',
            projectName: 'backend',
            command: 'npm run start',
            port: 8000,
            kind: 'server',
            status: 'stopped',
            logCount: 0,
          },
        ],
      },
    },
  });

  process.env.OPENFOX_PORT = String(fake.port);

  try {
    const plugin = createOpenFoxPlugin();
    const services = await plugin.servicesProvider?.listServices({ id: 'p1', dir: testDir } as any);
    assert.ok(services);
    assert.equal(services.length, 2);
    assert.equal(services[0]?.port, 10471);
    assert.equal(services[0]?.title, 'openfox › dev (Running)');
    assert.equal(services[0]?.workerId, 'dev-server');
    assert.equal(services[1]?.port, 8000);
    assert.equal(services[1]?.title, 'backend › api (Stopped)');
    assert.equal(services[1]?.workerId, 'dev-server-stopped');
  } finally {
    delete process.env.OPENFOX_PORT;
    await fake.close();
    await rm(testDir, { recursive: true, force: true });
  }
});

test('OpenFox plugin parses compact table format and includes commands', async () => {
  const { parseCompactTableString } = await import('../src/services.js');
  const compactSample =
    '[20]{name:string,path:string,dev:json?,commands:json?}\n' +
    'openfox,./openfox,"[{\\"\\"name\\"\\":\\"\\"dev\\"\\",\\"\\"command\\"\\":\\"\\"OPENFOX_PORT=10471 npm run dev\\"\\",\\"\\"icon\\"\\":\\"\\"PlayIcon\\"\\"}]",\n' +
    'agent-office,./agent-office,,"[{\\"\\"name\\"\\":\\"\\"build\\"\\",\\"\\"command\\"\\":\\"\\"npm run build\\"\\"}]"\n';

  const parsed = parseCompactTableString<any>(compactSample);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0]?.name, 'openfox');
  assert.equal(parsed[0]?.dev?.[0]?.command, 'OPENFOX_PORT=10471 npm run dev');
  assert.equal(parsed[1]?.name, 'agent-office');
  assert.equal(parsed[1]?.commands?.[0]?.command, 'npm run build');

  const testDir = join(tmpdir(), `openfox-test-compact-${Date.now()}`);
  const openfoxDir = join(testDir, '.openfox');
  await mkdir(openfoxDir, { recursive: true });

  const rawConfig = {
    projects:
      '[20]{name:string,path:string,dev:json?,commands:json?}\n' +
      'openfox,./openfox,"[{\\"\\"name\\"\\":\\"\\"dev\\"\\",\\"\\"command\\"\\":\\"\\"OPENFOX_PORT=10471 npm run dev\\"\\",\\"\\"icon\\"\\":\\"\\"PlayIcon\\"\\"}]",\n' +
      'agent-office,./agent-office,,"[{\\"\\"name\\"\\":\\"\\"build\\"\\",\\"\\"command\\"\\":\\"\\"npm run build\\"\\"}]"\n',
  };

  await writeFile(join(openfoxDir, 'openfox-multi-repo.json'), JSON.stringify(rawConfig, null, 2));

  try {
    const plugin = createOpenFoxPlugin();
    const services = await plugin.servicesProvider?.listServices({ id: 'p1', dir: testDir } as any);
    assert.ok(services);
    assert.equal(services.length, 2);
    // 1st: server
    assert.equal(services[0]?.port, 10471);
    assert.equal(services[0]?.title, 'openfox › dev (Stopped)');
    assert.equal(services[0]?.workerId, 'dev-server-stopped');
    // 2nd: command
    assert.equal(services[1]?.port, 0);
    assert.equal(services[1]?.title, 'agent-office › build [task] (Ready)');
    assert.equal(services[1]?.workerId, 'dev-server-stopped');
    assert.equal(services[1]?.command, 'npm run build');
  } finally {
    await rm(testDir, { recursive: true, force: true });
  }
});

test('OpenFox provider metadata is complete and guarantees no model/effort fields', async () => {
  const { OPENFOX_PROVIDER_META } = await import('../src/agent-provider.js');
  assert.equal(OPENFOX_PROVIDER_META.name, 'OpenFox');
  assert.equal(OPENFOX_PROVIDER_META.label, 'OpenFox');
  assert.equal(OPENFOX_PROVIDER_META.bin, 'openfox');
  assert.ok(Array.isArray(OPENFOX_PROVIDER_META.bins));
  assert.ok(OPENFOX_PROVIDER_META.bins.includes('openfox'));
  assert.ok(OPENFOX_PROVIDER_META.bins.includes('agent'));

  // Test command matcher
  assert.equal(typeof OPENFOX_PROVIDER_META.matchesCommand, 'function');
  assert.ok(OPENFOX_PROVIDER_META.matchesCommand('/Users/me/openfox-plugins/openfox-agent-office/dist/agent.js'));
  assert.ok(OPENFOX_PROVIDER_META.matchesCommand('agent.js'));
  assert.ok(OPENFOX_PROVIDER_META.matchesCommand('openfox'));
  assert.ok(OPENFOX_PROVIDER_META.matchesCommand('/usr/local/bin/openfox'));
  assert.equal(OPENFOX_PROVIDER_META.matchesCommand('/usr/local/bin/claude'), false);
  assert.equal(OPENFOX_PROVIDER_META.matchesCommand('codex'), false);

  // CRITICAL REGRESSION TEST: models and takesEffort MUST be undefined
  // so that Agent Office UI hides Model and Effort dropdowns for OpenFox
  assert.equal(OPENFOX_PROVIDER_META.models, undefined, 'OpenFox must NOT declare models');
  assert.equal(OPENFOX_PROVIDER_META.takesEffort, undefined, 'OpenFox must NOT declare takesEffort');
});

test('cleanServiceName cleans status suffixes and task tags accurately', async () => {
  const { cleanServiceName } = await import('../src/services.js');
  assert.equal(cleanServiceName('Dev Server (Stopped)'), 'Dev Server');
  assert.equal(cleanServiceName('Dev Server (Running)'), 'Dev Server');
  assert.equal(cleanServiceName('openfox › dev (Stopped)'), 'openfox › dev');
  assert.equal(cleanServiceName('openfox › dev (Running)'), 'openfox › dev');
  assert.equal(cleanServiceName('agent-office › build [task] (Ready)'), 'agent-office › build');
  assert.equal(cleanServiceName(undefined), undefined);
});

test('OpenFox ServicesProvider startService, stopService, getServiceLogs invoke correct endpoints', async () => {
  const calls: string[] = [];
  const fake = await fakeOpenFox({
    'POST /api/dev-server/start': { success: true },
    'POST /api/dev-server/stop': { success: true },
    'GET /api/dev-server/logs': { logs: ['log line 1', 'log line 2'] },
  });
  fake.server.on('request', (req) => {
    calls.push(`${req.method} ${req.url?.split('?')[0]}`);
  });
  process.env.OPENFOX_PORT = String(fake.port);

  try {
    const plugin = createOpenFoxPlugin();
    assert.ok(plugin.servicesProvider);

    // Single dev server (no multi-repo config file)
    await plugin.servicesProvider.startService?.({ id: 'p1', dir: '/test/single' } as any);
    assert.ok(calls.includes('POST /api/dev-server/start'));

    await plugin.servicesProvider.stopService?.({ id: 'p1', dir: '/test/single' } as any);
    assert.ok(calls.includes('POST /api/dev-server/stop'));

    const logs = await plugin.servicesProvider.getServiceLogs?.({ id: 'p1', dir: '/test/single' } as any);
    assert.deepEqual(logs, ['log line 1', 'log line 2']);
  } finally {
    delete process.env.OPENFOX_PORT;
    await fake.close();
  }
});

test('OpenFox FloorProvider decorates floor info and creates floors', async () => {
  const fake = await fakeOpenFox({
    'POST /api/projects': { project: { id: 'p-new', name: 'my-project', workdir: '/path/my-project' } },
  });
  process.env.OPENFOX_PORT = String(fake.port);

  try {
    const plugin = createOpenFoxPlugin();
    assert.ok(plugin.floorProvider);

    // decorateFloorInfo sets externalId, url, and clears repo
    const info: any = { id: 'p1', name: 'p1', repo: 'owner/repo' };
    plugin.floorProvider.decorateFloorInfo?.({ id: 'p1', dir: '/test' } as any, info);
    assert.equal(info.externalId, 'p1');
    assert.equal(info.repo, undefined);
    assert.ok(info.url.includes('/p/p1/new'));

    // createFloor calls API
    const res = await plugin.floorProvider.createFloor?.({ repo: 'owner/new-repo', dir: '/tmp/new-repo' });
    assert.ok(res);
    assert.equal(res.name, 'my-project');
    assert.equal(res.dir, '/path/my-project');
  } finally {
    delete process.env.OPENFOX_PORT;
    await fake.close();
  }
});

test('OpenFox QueueAdapter lists and deletes tasks', async () => {
  const deletedTasks: string[] = [];
  const fake = await fakeOpenFox({
    'GET /api/projects/p1/tasks': {
      tasks: [
        { id: 't1', title: 'Task Todo', prompt: 'prompt 1', status: 'todo' },
        { id: 't2', title: 'Task Running', prompt: 'prompt 2', status: 'in_progress', boundSessionId: 'sess-1' },
        { id: 't3', title: 'Task Done', prompt: 'prompt 3', status: 'done' },
      ],
    },
    'DELETE /api/projects/p1/tasks/t1': { success: true },
  });
  fake.server.on('request', (req) => {
    if (req.method === 'DELETE') deletedTasks.push(req.url ?? '');
  });
  process.env.OPENFOX_PORT = String(fake.port);

  try {
    const { OpenFoxQueueAdapter } = await import('../src/queue.js');
    const { OpenFoxClient } = await import('../src/client.js');
    const client = new OpenFoxClient();
    const adapter = new OpenFoxQueueAdapter(client);

    const tasks = await adapter.listTasks({ id: 'p1', dir: '/code' } as any);
    assert.equal(tasks.length, 3);
    assert.equal(tasks[0]?.id, 't1');
    assert.equal(tasks[0]?.status, 'queued');
    assert.equal(tasks[1]?.id, 't2');
    assert.equal(tasks[1]?.status, 'running');
    assert.equal(tasks[1]?.workerId, 'sess-1');
    assert.equal(tasks[2]?.id, 't3');
    assert.equal(tasks[2]?.status, 'done');

    await adapter.onTaskDeleted({ id: 'p1', dir: '/code' } as any, 't1');
    assert.ok(deletedTasks.some((u) => u.includes('/api/projects/p1/tasks/t1')));
  } finally {
    delete process.env.OPENFOX_PORT;
    await fake.close();
  }
});
