export interface OpenFoxProject {
  id: string;
  name: string;
  workdir: string;
  starred?: boolean;
  createdAt?: string;
  activeSessionId?: string;
}

export interface OpenFoxTask {
  id: string;
  projectId: string;
  title?: string;
  prompt: string;
  status: 'todo' | 'in_progress' | 'done';
  boundSessionId?: string;
  createdAt?: string;
}

export interface OpenFoxDevServerStatus {
  status: 'running' | 'stopped' | 'error';
  port?: number;
  url?: string;
  command?: string;
  config?: { command?: string; url?: string };
  logs?: Array<{ content?: string; chunk?: string } | string>;
}

export class OpenFoxClient {
  readonly baseUrl: string;
  private token: string;

  constructor() {
    let port = Number(process.env.OPENFOX_PORT || 10469);
    let token = process.env.OPENFOX_TOKEN || '';

    const bridgeEnv = process.env.OPENFOX_AGENT_OFFICE_BRIDGE;
    if (bridgeEnv) {
      try {
        const parsed = JSON.parse(bridgeEnv);
        if (parsed.serverUrl) {
          try {
            const u = new URL(parsed.serverUrl);
            const parsedPort = Number(u.port);
            // If parsed port is Vite dev server (5173), fallback to backend port 10469
            port = parsedPort && parsedPort !== 5173 ? parsedPort : port;
          } catch {
            // ignore
          }
        }
        if (parsed.token) token = parsed.token;
      } catch {
        // ignore
      }
    }

    this.baseUrl = `http://127.0.0.1:${port}`;
    this.token = token;
  }

  private async fetchJson<T>(path: string, options: RequestInit = {}): Promise<T | null> {
    try {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        ...(options.headers as Record<string, string>),
      };
      if (this.token) {
        headers['x-session-token'] = this.token;
        headers['x-openfox-token'] = this.token;
      }

      const res = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers,
      });

      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      return null;
    }
  }

  async getProjects(): Promise<OpenFoxProject[]> {
    const data = await this.fetchJson<{ projects?: OpenFoxProject[]; data?: OpenFoxProject[] }>('/api/projects');
    if (!data) return [];
    return data.projects || data.data || [];
  }

  async createProject(name: string, workdir: string): Promise<OpenFoxProject | null> {
    return await this.fetchJson<OpenFoxProject>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name, workdir }),
    });
  }

  async getTasks(projectId: string): Promise<OpenFoxTask[]> {
    const data = await this.fetchJson<{ tasks?: OpenFoxTask[]; data?: OpenFoxTask[] }>(`/api/projects/${encodeURIComponent(projectId)}/tasks`);
    if (!data) return [];
    return data.tasks || data.data || [];
  }

  async deleteTask(projectId: string, taskId: string): Promise<boolean> {
    const res = await this.fetchJson<{ success?: boolean }>(`/api/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`, {
      method: 'DELETE',
    });
    return Boolean(res?.success);
  }

  async getDevServer(workdir: string): Promise<OpenFoxDevServerStatus | null> {
    return await this.fetchJson<OpenFoxDevServerStatus>(`/api/dev-server?workdir=${encodeURIComponent(workdir)}`);
  }

  async startDevServer(workdir: string): Promise<OpenFoxDevServerStatus | null> {
    return await this.fetchJson<OpenFoxDevServerStatus>(`/api/dev-server/start?workdir=${encodeURIComponent(workdir)}`, {
      method: 'POST',
    });
  }

  async stopDevServer(workdir: string): Promise<OpenFoxDevServerStatus | null> {
    return await this.fetchJson<OpenFoxDevServerStatus>(`/api/dev-server/stop?workdir=${encodeURIComponent(workdir)}`, {
      method: 'POST',
    });
  }

  async getDevServerLogs(workdir: string): Promise<string[]> {
    const data = await this.fetchJson<{ logs?: Array<{ content?: string; chunk?: string } | string> }>(
      `/api/dev-server/logs?workdir=${encodeURIComponent(workdir)}`,
    );
    if (!data?.logs) return [];
    return data.logs.map((l) => (typeof l === 'string' ? l : (l.content ?? l.chunk ?? '')));
  }
}
