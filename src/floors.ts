import type { FloorDef, FloorInfo, FloorLike, FloorProvider } from './types.js';
import type { OpenFoxClient, OpenFoxProject } from './client.js';

export class OpenFoxFloorProvider implements FloorProvider {
  private client: OpenFoxClient;
  private projectMap: Map<string, OpenFoxProject> = new Map();

  constructor(client: OpenFoxClient) {
    this.client = client;
  }

  async listFloors(): Promise<FloorDef[]> {
    const projects = await this.client.getProjects();
    this.projectMap.clear();

    const sorted = [...projects].sort((a, b) => {
      const aStar = Boolean(a.starred);
      const bStar = Boolean(b.starred);
      if (aStar && !bStar) return -1;
      if (!aStar && bStar) return 1;
      return a.name.localeCompare(b.name);
    });

    const defs: FloorDef[] = [];
    let idx = 0;
    for (const p of sorted) {
      this.projectMap.set(p.id, p);
      defs.push({
        id: p.id,
        name: p.name,
        dir: p.workdir,
        repo: undefined,
        palette: idx % 8,
        addedBy: 'openfox',
        addedAt: p.createdAt ? new Date(p.createdAt).getTime() : 0,
        externalId: p.id,
        url: `${this.client.baseUrl}/p/${p.id}/new`,
      });
      idx++;
    }

    return defs;
  }

  sortFloors(floors: FloorInfo[]): FloorInfo[] {
    return [...floors].sort((a, b) => {
      const pA = this.projectMap.get(a.id);
      const pB = this.projectMap.get(b.id);
      const aStar = Boolean(pA?.starred);
      const bStar = Boolean(pB?.starred);
      if (aStar && !bStar) return -1;
      if (!aStar && bStar) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  async createFloor(req: { repo?: string; dir?: string }): Promise<{ repo: string; dir: string; name: string } | null> {
    const name = req.repo ? req.repo.split('/').pop() || req.repo : (req.dir?.split('/').pop() || 'new-project');
    const workdir = req.dir || process.cwd();
    const created = await this.client.createProject(name, workdir);
    if (!created) return null;
    return {
      name: created.name,
      dir: created.workdir,
      repo: '',
    };
  }

  decorateFloorInfo(floor: FloorLike, info: FloorInfo): void {
    info.externalId = floor.id;
    info.url = `${this.client.baseUrl}/p/${floor.id}/new`;
    info.repo = undefined;
  }
}
