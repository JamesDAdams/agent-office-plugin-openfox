import { OpenFoxClient } from './client.js';
import { OpenFoxFloorProvider } from './floors.js';
import { OpenFoxQueueAdapter } from './queue.js';
import { OpenFoxServicesProvider } from './services.js';
import type { OfficePlugin } from './types.js';

export * from './types.js';
export * from './client.js';
export * from './floors.js';
export * from './queue.js';
export * from './services.js';

export function createOpenFoxPlugin(): OfficePlugin {
  const client = new OpenFoxClient();
  const floorProvider = new OpenFoxFloorProvider(client);
  const queueAdapter = new OpenFoxQueueAdapter(client);
  const servicesProvider = new OpenFoxServicesProvider(client);

  return {
    manifest: {
      id: 'openfox',
      name: 'OpenFox Harness',
      version: '1.0.0',
      author: 'OpenFox',
      description: 'Bridges Agent Office with OpenFox projects, task queue, dev servers, background processes, and agent sessions.',
      capabilities: ['floors', 'queue', 'services', 'agent'],
      enabled: true,
      status: 'active',
    },
    floorProvider,
    queueAdapter,
    servicesProvider,
  };
}

export const createPlugin = createOpenFoxPlugin;
export default createOpenFoxPlugin;
