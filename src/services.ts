import { existsSync } from 'node:fs';
import path from 'node:path';
import type { FloorLike, ServiceInfo, ServicesProvider } from './types.js';
import type { OpenFoxClient } from './client.js';

export class OpenFoxServicesProvider implements ServicesProvider {
  private client: OpenFoxClient;

  constructor(client: OpenFoxClient) {
    this.client = client;
  }

  async listServices(floor: FloorLike): Promise<ServiceInfo[]> {
    const list: ServiceInfo[] = [];

    try {
      const devJsonPath = path.join(floor.dir, '.openfox', 'dev.json');
      const hasDevConfig = existsSync(devJsonPath);
      const devServer = await this.client.getDevServer(floor.dir);

      const isRunning = devServer?.state === 'running' || devServer?.state === 'starting' || devServer?.status === 'running' || Boolean(devServer?.port && devServer.port > 0);

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

        const stateLabel = devServer?.state === 'starting'
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

  async startService(floor: FloorLike): Promise<void> {
    await this.client.startDevServer(floor.dir);
  }

  async stopService(floor: FloorLike): Promise<void> {
    await this.client.stopDevServer(floor.dir);
  }

  async getServiceLogs(floor: FloorLike): Promise<string[]> {
    return await this.client.getDevServerLogs(floor.dir);
  }
}
