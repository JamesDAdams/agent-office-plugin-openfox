import type { AgentProviderPlugin, ProviderMeta, ProviderAdapter } from './types.js';

export const OPENFOX_PROVIDER_META: ProviderMeta = {
  label: 'OpenFox',
  name: 'OpenFox',
  bin: 'openfox',
  unpicked: 'OpenFox agents use the model configured in OpenFox settings.',
  usage: {
    reports: true,
    note: 'OpenFox usage is tracked by the OpenFox server.',
  },
};

const openfoxAdapter: ProviderAdapter = {
  id: 'openfox',
  launch({ args, prompt, resumeSessionId }) {
    if (resumeSessionId) args.push('--resume', resumeSessionId);
    if (prompt) args.push('--', prompt);
    return { args };
  },
  hooksAs: 'claude',
  usage: { transcript: true },
  namesTasks: true,
};

export function createOpenFoxAgentProvider(): AgentProviderPlugin {
  return {
    id: 'openfox',
    meta: OPENFOX_PROVIDER_META,
    adapter: openfoxAdapter,
  };
}
