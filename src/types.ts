export type PluginCapability = 'floors' | 'issues' | 'queue' | 'services' | 'agent';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  author?: string;
  description: string;
  capabilities: PluginCapability[];
  enabled: boolean;
  entry?: string;
  status?: 'active' | 'inactive' | 'error';
  error?: string;
}

export interface FloorDef {
  id: string;
  name: string;
  repo?: string;
  dir: string;
  palette: number;
  addedBy: string;
  addedAt: number;
  externalId?: string;
  url?: string;
}

export interface FloorInfo {
  id: string;
  name: string;
  repo?: string;
  dir: string;
  branch?: string;
  palette: number;
  cloning?: boolean;
  local?: boolean;
  addedBy: string;
  addedAt: number;
  externalId?: string;
  url?: string;
  workers: number;
  busy: number;
  waiting: number;
  people: number;
  wing: number;
}

export interface GhLabel {
  name: string;
  color: string;
  description?: string;
}

export interface GhIssue {
  number: number;
  title: string;
  state: string;
  url: string;
  author: string;
  labels: GhLabel[];
  assignees: string[];
  taken?: boolean;
  createdAt: string;
  updatedAt: string;
  body: string;
  comments: number;
}

export interface QueueTask {
  id: string;
  provider?: string;
  externalId?: string;
  model?: string;
  effort?: string;
  issue?: number;
  title: string;
  prompt: string;
  addedBy: string;
  owner?: string;
  addedAt: number;
  status: 'queued' | 'running' | 'done';
  workerId?: string;
  workerName?: string;
  branch?: string;
  startedAt?: number;
  finishedAt?: number;
  outcome?: 'done' | 'exited' | 'killed' | 'failed';
  error?: string;
}

export interface ServiceInfo {
  port: number;
  host: string;
  pid: number;
  command: string;
  workerId: string;
  cwd: string;
  title?: string;
  since: number;
}

export interface FloorLike {
  id: string;
  dir: string;
  def?: { name?: string };
}

export interface FloorProvider {
  listFloors(): Promise<FloorDef[]> | FloorDef[];
  sortFloors?(floors: FloorInfo[]): FloorInfo[];
  createFloor?(req: { repo?: string; dir?: string }): Promise<{ repo: string; dir: string; name: string } | null>;
  decorateFloorInfo?(floor: FloorLike, info: FloorInfo): void;
}

export interface IssuesAdapter {
  listIssues(floor: FloorLike): Promise<GhIssue[]>;
}

export interface QueueAdapter {
  listTasks?(floor: FloorLike): Promise<QueueTask[]>;
  onTaskCreated?(floor: FloorLike, prompt: string): Promise<void>;
  onTaskDeleted?(floor: FloorLike, taskId: string): Promise<void>;
}

export interface ServicesProvider {
  listServices(floor: FloorLike): Promise<ServiceInfo[]>;
  startService?(floor: FloorLike, serviceName?: string): Promise<void>;
  stopService?(floor: FloorLike, serviceName?: string): Promise<void>;
  getServiceLogs?(floor: FloorLike, serviceName?: string, lines?: number): Promise<string[]>;
}

export interface AgentEffort {
  low: string;
  medium: string;
  high: string;
  xhigh: string;
  max: string;
}

export interface ModelOption {
  id: string;
  name?: string;
  efforts?: string[];
}

export interface ModelField {
  pick: 'list' | 'typed';
  fixed?: readonly ModelOption[];
  catalog?: boolean;
  unset: string;
  max?: number;
  hint: string;
  invalid?: string;
}

export interface ProviderMeta {
  label: string;
  name: string;
  bin?: string;
  validModel?: (value: unknown) => value is string;
  invalidModel?: string;
  models?: ModelField;
  takesEffort?: boolean;
  effortLabel?: string;
  unpicked?: string;
  usage: {
    tracked?: boolean;
    reports?: boolean;
    noCost?: boolean;
    waiting?: string;
    note: string;
  };
}

export interface LaunchPlan {
  args: string[];
  env?: Record<string, string>;
  rotateToken?: boolean;
  finishEnv?(env: Record<string, string>): void;
}

export interface LaunchInput {
  args: string[];
  prompt?: string;
  resumeSessionId?: string;
  cwd: string;
  setup: unknown;
}

export interface ProviderAdapter {
  id: string;
  scrubEnv?: readonly string[];
  scrubPrefixes?: readonly string[];
  createState?(): unknown;
  prepare?(floor: { dataDir: string; mcpScript?: string; dshProfile: string }): unknown;
  launch(input: LaunchInput): LaunchPlan;
  exited?(h: unknown, cwd: string): void;
  transport?: 'pty' | 'acp';
  signIn?: string;
  bootHint?: string;
  titleNoise?: RegExp;
  freshIfResumeFails?: boolean;
  hook?: {
    strictJson: boolean;
    handle(h: unknown, event: string, payload: unknown): boolean;
  };
  hooksAs?: string;
  screen?: {
    progress?: boolean;
    blocked?(text: string, early: boolean): string | undefined;
  };
  usage?: {
    transcript?: boolean;
    persisted?: boolean;
    scan?(h: unknown): void;
    scanOnExit?: boolean;
    locate?(h: unknown, cwd: string, env: Record<string, string | undefined>): void;
    save?(state: unknown): Record<string, unknown>;
    restore?(state: unknown, saved: Record<string, unknown>): void;
  };
  namesTasks?: boolean;
}

export interface AgentProviderPlugin {
  id: string;
  meta: ProviderMeta;
  adapter: ProviderAdapter;
}

export interface OfficePlugin {
  manifest: PluginManifest;
  init?(ctx?: unknown): Promise<void> | void;
  shutdown?(): Promise<void> | void;
  floorProvider?: FloorProvider;
  issuesAdapter?: IssuesAdapter;
  queueAdapter?: QueueAdapter;
  servicesProvider?: ServicesProvider;
  agentProvider?: AgentProviderPlugin;
}
