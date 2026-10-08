import { OpenFoxClient } from './client.js';
import { OpenFoxFloorProvider } from './floors.js';
import { OpenFoxIssuesAdapter } from './issues.js';
import { OpenFoxServicesProvider } from './services.js';
import { createOpenFoxAgentProvider } from './agent-provider.js';
import type { OfficePlugin } from './types.js';

export * from './types.js';
export * from './client.js';
export * from './floors.js';
export * from './issues.js';
export * from './queue.js';
export * from './services.js';
export * from './agent-provider.js';

export function createOpenFoxPlugin(): OfficePlugin {
  const client = new OpenFoxClient();
  const floorProvider = new OpenFoxFloorProvider(client);
  const issuesAdapter = new OpenFoxIssuesAdapter(client);
  const servicesProvider = new OpenFoxServicesProvider(client);
  const agentProvider = createOpenFoxAgentProvider();

  return {
    manifest: {
      id: 'openfox',
      name: 'OpenFox Harness',
      version: '1.0.0',
      author: 'James Adams',
      description: 'Bridges Agent Office with OpenFox projects, task issues, dev servers, background processes, and agent sessions.',
      capabilities: ['floors', 'issues', 'services', 'agent'],
      enabled: true,
      status: 'active',
    },
    floorProvider,
    issuesAdapter,
    servicesProvider,
    agentProvider,
  };
}

export const createPlugin = createOpenFoxPlugin;
export default createOpenFoxPlugin;
