export type PluginCapability = 'floors' | 'queue' | 'services' | 'agent';

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

export interface OfficePlugin {
  manifest: PluginManifest;
  init?(ctx?: unknown): Promise<void> | void;
  shutdown?(): Promise<void> | void;
  floorProvider?: FloorProvider;
  queueAdapter?: QueueAdapter;
  servicesProvider?: ServicesProvider;
}
