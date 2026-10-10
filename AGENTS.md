# AGENTS.md — agentoffice-openfox

Paths relative to `agent-office-plugins/agentoffice-openfox/`.

## Purpose

Agent Office plugin that synchronizes OpenFox projects as "floors" in Agent Office, bridges Kanban tasks with the OpenFox task board, and manages OpenFox dev servers, logs, and background processes. It also provides the `openfox` agent provider, so an office worker runs as an OpenFox session.

**All the OpenFox logic lives here.** The Agent Office core holds only the seams a plugin plugs into (`agent-office/docs/code-layout.md` → *Plugin seams*); it must never carry code specific to this plugin. When something here stops reaching the office, fix it at the seam in `agent-office/src/server/plugins/` generically, not here.

## Stack

- TypeScript, ESM, tsup
- Node.js test runner (`node --test`)
- peerDep: `openfox` (external)

## Commands

```bash
npm run build      # tsup
npm run dev        # tsup --watch
npm test           # node --import tsx --test tests/*.test.ts
npm run typecheck  # tsc --noEmit
```

## Project Map

```
src/
├── index.ts          # Plugin entry point
├── agent-provider.ts # Agent provider
├── client.ts         # OpenFox API client
├── floors.ts         # FloorProvider (projects → floors)
├── issues.ts         # Issue management
├── queue.ts          # QueueAdapter (Kanban ↔ task board)
├── services.ts       # ServicesProvider (dev servers, logs, processes)
└── types.ts          # Shared TypeScript types
```

## Where to Look What

- **Modify project synchronization** → `src/floors.ts`
- **Modify Kanban ↔ task board bridge** → `src/queue.ts`
- **Modify dev server management** → `src/services.ts`
- **Modify OpenFox API client** → `src/client.ts`
- **Add a type** → `src/types.ts`

## Conventions

- ESM build only via tsup
- Tests via `node --import tsx --test tests/*.test.ts`
- `openfox` is externalized (provided by host)

## Agent Office Seams This Plugin Uses

| Capability | Agent Office end | This plugin |
| --- | --- | --- |
| `agentProvider` | `shared/providers.ts` `registerAgentProvider`, hired through `server/agents.ts` | `src/agent-provider.ts` |
| `floorProvider` | `server/plugin-floors.ts` (merged, never swapped) | `src/floors.ts` |
| `issuesAdapter` | `server/github.ts` (used when it has rows, else `gh` answers) | `src/issues.ts` |
| `servicesProvider` | `server/office/services.ts` (merged with the port scan) | `src/services.ts` |
| `queueAdapter` | `server/queue.ts` `syncFromAdapter` | `src/queue.ts` |
| `settingsPage` | served under `/plugins/<id>/` from the plugin's own directory | a file named in the manifest |

## Cross-Project Dependencies

**Consumes**: `openfox` (HTTP API, routes in `openfox/src/server/routes/`).

**Consumed by**: Agent Office (loaded as plugin).

**Touchpoints**:

- Agent Office side: `src/floors.ts`, `src/queue.ts`, `src/services.ts`
- OpenFox side: HTTP API (routes in `openfox/src/server/routes/`)

## Known Gotchas

- `dist/index.js` is the entry point loaded by Agent Office, not `src/`.
- An empty list from `listIssues`/`listPulls`/`listFloors` means "nothing here"; return it as such so the office falls back to `gh` or keeps its own floors. Returning `[]` from `listIssues` would leave GitHub's own issues off the board.
- The plugin bridges two task systems (Agent Office Kanban ↔ OpenFox task board). Watch out for concurrency.

## Do Not Read / Do Not Touch

- `node_modules/`, `dist/`, `.git/`

## Further Reading

- [README.md](README.md) — overview

---

> After any change affecting structure, a command, a convention, an inter-project contract, or a primary flow, update this file in the same commit. If any information here is inaccurate, fix it.
