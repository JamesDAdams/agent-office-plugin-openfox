import type { FloorLike, QueueAdapter, QueueTask } from './types.js';
import type { OpenFoxClient } from './client.js';

export class OpenFoxQueueAdapter implements QueueAdapter {
  private client: OpenFoxClient;

  constructor(client: OpenFoxClient) {
    this.client = client;
  }

  async listTasks(floor: FloorLike): Promise<QueueTask[]> {
    const rawTasks = await this.client.getTasks(floor.id);
    const tasks: QueueTask[] = [];

    for (const t of rawTasks) {
      tasks.push({
        id: t.id,
        status: t.status === 'in_progress' ? 'running' : t.status === 'done' ? 'done' : 'queued',
        title: t.title || t.prompt || 'Task',
        prompt: t.prompt || t.title || '',
        addedBy: 'openfox',
        addedAt: t.createdAt ? new Date(t.createdAt).getTime() : 0,
        workerId: t.boundSessionId,
      });
    }

    return tasks;
  }

  async onTaskDeleted(floor: FloorLike, taskId: string): Promise<void> {
    await this.client.deleteTask(floor.id, taskId);
  }
}
