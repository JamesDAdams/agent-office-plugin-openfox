import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createOpenFoxPlugin } from '../src/index.js';

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

test('OpenFox plugin syncs tasks via QueueAdapter', async () => {
  const fake = await fakeOpenFox({
    'GET /api/projects/p1/tasks': {
      tasks: [
        { id: 't1', title: 'Task 1', prompt: 'do it', status: 'todo' },
        { id: 't2', title: 'Task 2', prompt: 'in progress', status: 'in_progress', boundSessionId: 's1' },
      ],
    },
  });
  process.env.OPENFOX_PORT = String(fake.port);

  try {
    const plugin = createOpenFoxPlugin();
    const tasks = await plugin.queueAdapter?.listTasks?.({ id: 'p1', dir: '/code/p1' } as any);
    assert.equal(tasks?.length, 2);
    assert.equal(tasks?.[0]?.id, 't1');
    assert.equal(tasks?.[0]?.status, 'queued');
    assert.equal(tasks?.[1]?.id, 't2');
    assert.equal(tasks?.[1]?.status, 'running');
    assert.equal(tasks?.[1]?.workerId, 's1');
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
