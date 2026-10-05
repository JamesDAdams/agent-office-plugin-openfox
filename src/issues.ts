import type { FloorLike, GhIssue, GhLabel, IssuesAdapter } from './types.js';
import type { OpenFoxClient, OpenFoxTask } from './client.js';

export function taskIdToNumber(id: string): number {
  const digits = id.replace(/\D/g, '');
  if (digits.length > 0 && digits.length <= 6) {
    const parsed = parseInt(digits, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return (hash % 900000) + 100000;
}

export class OpenFoxIssuesAdapter implements IssuesAdapter {
  private client: OpenFoxClient;

  constructor(client: OpenFoxClient) {
    this.client = client;
  }

  async listIssues(floor: FloorLike): Promise<GhIssue[]> {
    const rawTasks = await this.client.getTasks(floor.id);
    const issues: GhIssue[] = [];

    for (const t of rawTasks) {
      issues.push(this.taskToIssue(t, floor.id));
    }

    return issues;
  }

  private taskToIssue(task: OpenFoxTask, projectId: string): GhIssue {
    const num = taskIdToNumber(task.id);
    const title = (task.title || task.prompt || 'Task').split('\n')[0] ?? 'Task';
    const isClosed = task.status === 'done';
    const isProgress = task.status === 'in_progress';

    const labels: GhLabel[] = [
      {
        name: isProgress ? 'in progress' : task.status,
        color: isProgress ? '#f59e0b' : isClosed ? '#10b981' : '#3b82f6',
        description: `OpenFox status: ${task.status}`,
      },
    ];

    return {
      number: num,
      title,
      state: isClosed ? 'CLOSED' : 'OPEN',
      url: task.boundSessionId ? `/p/${encodeURIComponent(projectId)}/s/${encodeURIComponent(task.boundSessionId)}` : '',
      author: 'OpenFox',
      labels,
      assignees: task.boundSessionId ? [task.boundSessionId] : [],
      taken: isProgress,
      createdAt: task.createdAt || new Date(0).toISOString(),
      updatedAt: task.createdAt || new Date(0).toISOString(),
      body: task.prompt || '',
      comments: 0,
    };
  }
}
