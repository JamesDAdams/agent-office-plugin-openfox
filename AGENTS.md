# AGENTS.md — agentoffice-openfox

Paths relative to `agent-office-plugins/agentoffice-openfox/`.

## Purpose

Agent Office plugin that synchronizes OpenFox projects as "floors" in Agent Office, bridges Kanban tasks with the OpenFox task board, and manages OpenFox dev servers, logs, and background processes.

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

## Cross-Project Dependencies

**Consumes**: `openfox` (HTTP API, routes in `openfox/src/server/routes/`).

**Consumed by**: Agent Office (loaded as plugin).

**Touchpoints**:

- Agent Office side: `src/floors.ts`, `src/queue.ts`, `src/services.ts`
- OpenFox side: HTTP API (routes in `openfox/src/server/routes/`)

## Known Gotchas

- `dist/index.js` is the entry point loaded by Agent Office, not `src/`.
- The plugin bridges two task systems (Agent Office Kanban ↔ OpenFox task board). Watch out for concurrency.

## Do Not Read / Do Not Touch

- `node_modules/`, `dist/`, `.git/`

## Further Reading

- [README.md](README.md) — overview

---

> After any change affecting structure, a command, a convention, an inter-project contract, or a primary flow, update this file in the same commit. If any information here is inaccurate, fix it.
