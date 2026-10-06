# Xaihi

**English** · [简体中文](README.zh.md)

A workspace extension framework and domain-node ecosystem on top of
**DeepSeek Harness** (DSH). Xaihi does not fork DSH and does not ship a runtime: it adds a
workbench shell, a node contract, a Material You theme bridge, an M3 UI kit and a set of real
domain nodes — all as legitimate DSH plugin-bundles.

Status: framework, SDK, scaffolder and five nodes are implemented and gated; two end-to-end
proofs are still blocked on things outside this repo (see [What is not proven yet](#what-is-not-proven-yet)).

## Who owns what

| Layer | Owner | Provides |
|---|---|---|
| Host / runtime | **DSH** | plugin lifecycle, profile layering, web + desktop hosts, slots, theme engine, approval & permission presets, subprocess, storage, commands |
| Workbench | `@hibernalglow/xaihi-ui` | the `main` panel shell, layout, `UIModuleLoader`, Xaihi slot declarations, Material You bridge |
| Host half | `@hibernalglow/xaihi-core` | node discovery, `/xaihi/*` routes, operation journal + durable ledger |
| Contract | `@hibernalglow/xaihi-sdk` | `xaihi.manifest/1`, `xaihi.node/v1`, event vocabulary, `defineNode` |
| Components | `@hibernalglow/xaihi-ui-kit` | the only place a colour literal may appear in a panel |
| Domain nodes | `plugins/*` | one package per node: host actions plus its own UI artifact |

Hard rules: never copy the loader, never occupy the `root` slot, never build a second desktop
shell / updater / marketplace / agent loop, and when DSH cannot support a design —
[file a proposal](docs/upstream-proposals.md) instead of hacking around it.

## Getting oriented

| Read | For |
|---|---|
| [`CONTEXT.md`](CONTEXT.md) | the vocabulary (node vs plugin, run, ledger, command surface, …) |
| [`docs/roadmap.md`](docs/roadmap.md) | what is scheduled, what is undecided, what we deliberately do not do |
| [`docs/stages/`](docs/stages/) | per-step reports: what changed, why, how it maps onto DSH APIs (`file:line`), numbered evidence |
| [`docs/adr/`](docs/adr/) | architecture decisions (transport, self-contained packages, non-JS cores, entry bundle) |
| [`docs/service-mapping.md`](docs/service-mapping.md) | every Xiranite service mapped to an existing DSH subsystem — the gate before moving anything |
| [`.dsh/skills/`](.dsh/skills/) | skills loaded by coding agents working in this repo |

## Requirements

- Node `^22.19.0 || >=24.0.0`, pnpm 12 (`packageManager` is pinned).
- All `@deepseek-ai/*` dependencies are pinned to **`0.2.0-rc.2`** as local devDependencies.
  Never run a bare `pnpm add @deepseek-ai/<x>`: several of those packages' `latest` dist-tag
  still points at `0.0.1-rc.1`. `pnpm check:pins` is the gate that enforces it.

## Development loop

```bash
pnpm install
pnpm build            # tsdown for host halves, rspack Module Federation for node UI artifacts
pnpm test             # pins + skills + panels + installable gates, then build, typecheck, unit tests
```

The dev host always runs **isolated** from your daily harness:

```bash
pnpm host             # DSH_HOME=$PWD/../.scratch/dsh-xaihi-home, profile xaihi, port 3199
pnpm plugin:add file:$PWD/plugins/<node>     # install a node into that isolated profile
pnpm profile:dump     # --dump-config: prove the bundle layers actually merged, in order
```

A profile does not isolate sessions (they are keyed by cwd under `$DSH_HOME/sessions`), which is
exactly why the scratch `DSH_HOME` is mandatory rather than a suggestion.

## Quality gates

| Gate | What it refuses |
|---|---|
| `check:pins` | any `@deepseek-ai/*` dependency not pinned to the release we validated against |
| `check:skills` | skills that drift from `.dsh/skills/<kebab-case>/SKILL.md` |
| `check:panels` | panels that colour themselves (hex, `rgb()/hsl()`, direct `--dsw-` references, own React root) instead of going through the UI kit; also reports a plugin that has `frontend/` but no `Panel.tsx` |
| `check:installable` | a bundle package carrying `workspace:*` runtime dependencies, which pnpm refuses at install time |
| purity (in `ui-host` tests) | browser-side value imports outside the module-table baseline — inlining a second harness context is caught by product inspection |
| every gate | each `check:*` script runs a `--self-check` first — a synthetic violation that the rule must catch, plus a case it must *not* flag; the purity, theme and scaffold tests carry in-test falsification cases. A ruler that cannot go red is treated as absent |

## Current nodes

| Node | What it does | Host requirement |
|---|---|---|
| `hello` | the plumbing sample: one loader row, one tool, one panel | none |
| `linedup` | line dedup / filter (pure logic) | none |
| `sleept` | power state, prevent-sleep hold, display-off, screensaver (macOS + Windows) | external-process |
| `dissolvef` | fold single-file folders, with checkpoint/undo semantics | file-io, recursive enumeration |
| `findz` | archive library search over a process-out Go core | non-JS core via subprocess (ADR-0004) |

## What is not proven yet

- **A real node run recorded durably.** `/xaihi/history.json` reads
  `{"schema":"xaihi.ledger/1","durable":true,"records":[]}` — the storage seam holds, but no run
  has ever been written. Triggering a run needs either a model credential in the isolated home or
  a visible browser session; we did not fabricate an agent id or open our own execution route.
- **Panel buttons dispatching.** In `0.2.0-rc.2` a third-party plugin client cannot obtain the
  current `agentId`, and every `commands/*` method requires it as its first wire field. The panel
  therefore fails honestly and the request is filed upstream
  ([P1](docs/upstream-proposals.md)).
- **The entry bundle `@hibernalglow/xaihi`.** It is a publish-time artifact: `file:` install is
  refused because its `workspace:*` dependencies cannot resolve outside this repo. See
  [ADR-0005](docs/adr/0005-entry-bundle-reachability.md) and roadmap item R9.

## Licensing

MIT. Skills under `.dsh/skills/` that are vendored from upstream carry their own attribution and
upstream commit; DeepSeek Harness is MIT (c) 2026 DeepSeek.
