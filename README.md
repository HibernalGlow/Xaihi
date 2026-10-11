# Xaihi

**English** · [简体中文](README.zh.md)

<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="Xaihi: a workbench extension framework and domain-node ecosystem on top of DeepSeek Harness. The title sits on a wall of the 27 real node names; the exhibit on the right is a real node manifest and the first public route.">
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-2E7E99" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/DeepSeek%20Harness-0.2.0--rc.2-5DE6FE" alt="dsh pinned to 0.2.0-rc.2">
  <img src="https://img.shields.io/badge/nodes-27-1D4E62" alt="27 domain nodes">
  <img src="https://img.shields.io/badge/gates-14-173A4A" alt="14 steps in pnpm test">
</p>

Xaihi is a workbench layer on top of **DeepSeek Harness (DSH)**: **27 domain nodes**, each shipping
its own backend actions, parameter list, danger semantics, workspace panel and terminal face — all
as **legitimate DSH plugin-bundles**. It does not fork DSH, does not ship a runtime, and does not
rebuild anything DSH already provides.

## Where it actually stands

"Built" and "verified on a real host" are different claims, so they are listed separately:

- **Verified on a real host** — `pnpm plugin:add` installs the node packages into a profile;
  `pnpm profile:dump` returns rc=0 with 1,347 lines of merged layer config and 29
  `# == @hibernalglow` sections (27 node packages + `xaihi-core` + `xaihi-ui`).
  Raw output: [`docs/stages/live-remotes-2026-10-07.md`](docs/stages/live-remotes-2026-10-07.md).
- **Compile-verified / test-double only** — per the 2026-10-07 stage report, assertions at the level of
  "`ctx.subprocess` really runs" or "the `ask` approval seam fires" were still test-double or
  compile-verified ([`plan-review-2026-10-07.md`](docs/stages/plan-review-2026-10-07.md), item 6).
- **A build is not a screen** — measured 2026-10-09: `pnpm build:ui` returns rc=0
  (`main.js` 1.342 MiB + `main.css` 654 KiB, two size warnings). "Node UIs are on screen" is not
  proven by that build: the gauge for it is `scripts/check-nodeface-live.mjs`, whose five criteria are
  all read back from the interface and from the other side of the bridge, and which needs a running
  development host plus a headless browser with a debugging port. Like `check:cliface` and
  `check:tuiface` it is field forensics and is **deliberately not wired into `pnpm test`**.

## How it works

<p align="center">
  <img src="./assets/readme/architecture.svg" width="100%" alt="Mechanism: 27 plugin-bundles are installed into the DSH host via pnpm plugin:add, xaihi-core discovers and registers them, and only three routes are exposed — the workbench document, node remotes, and the operations event stream.">
</p>

Four mechanisms, each with a source reference:

- **One source of truth per node definition** — `package.json#xaihi.node`; tool registration reads
  it, so the manifest and the code cannot disagree (`plugins/linedup/src/index.ts:2-4`).
  The contract is `xaihi.node/v1`, the manifest is `xaihi.manifest/1`.
- **A plugin *is* a bundle** — every package carries its own `dsh.bundle.patch`; a profile cannot
  resolve in-repo `workspace:*`, so installable packages must be self-contained (ADR-0002,
  enforced by `scripts/check-installable.mjs`).
- **Configuration has exactly one exit** — declaration is a `Schema.object({ … })` of `.volatile()`
  fields, values come from DSH's patch layers, reads and writes go through `ctx.settings` /
  `ctx.remote.settings`. Xaihi ships no config file of its own (ADR-0013), and secrets move only via
  path operations.
- **The UI is ported, not invented** — the verb is porting and wiring, not redesigning (ADR-0006);
  first-party nodes render through the in-repo realm registry, and Module Federation remotes are
  reserved for third parties (ADR-0014).

## The 27 nodes

<p align="center">
  <img src="./assets/readme/nodes.svg" width="100%" alt="Hexagonal board of the 27 nodes; each cell's fill encodes that node's test-file count, printed in the cell. findz is dashed as the only node without a CLI bin; kisaki is rose-outlined for its native czkawka Rust core.">
</p>

The six design languages `native | md3 | mondrian | wuling | swiss | lonestar`
(`packages/ui-host/src/lib/design-theme/contract.ts:28`) treat **`md3` as one option, never the
default**; `native` is an explicit no-op so that "no advanced theme" is a fact in code. Image-seeded
colour (`image`) is **not wired**, so it is deliberately absent from the type — an enum value nobody
implements is the next false green (same file, `:63-67`).

<details>
<summary>Test files and terminal face per node (measured 2026-10-09)</summary>

| Node | Tests | bin | Node | Tests | bin |
| --- | ---: | :---: | --- | ---: | :---: |
| `bandia` | 4 | ✓ | `linku` | 3 | ✓ |
| `bitv` | 4 | ✓ | `marku` | 3 | ✓ |
| `classf` | 4 | ✓ | `migratef` | 3 | ✓ |
| `classq` | 3 | ✓ | `mvz` | 4 | ✓ |
| `cleanf` | 3 | ✓ | `nameu` | 3 | ✓ |
| `crashu` | 3 | ✓ | `rawfilter` | 3 | ✓ |
| `dissolvef` | 2 | ✓ | `recycleu` | 3 | ✓ |
| `encodeb` | 3 | ✓ | `repacku` | 4 | ✓ |
| `enginev` | 3 | ✓ | `samea` | 2 | ✓ |
| `findz` | 6 | — | `sleept` | 5 | ✓ |
| `formatv` | 3 | ✓ | `smartzip` | 4 | ✓ |
| `gifu` | 4 | ✓ | `timeu` | 2 | ✓ |
| `kisaki` | 24 | ✓ | `trename` | 3 | ✓ |
| `linedup` | 2 | ✓ | total | 110 | 26 / 27 |

Three deserve a note: `findz` indexes through an **out-of-process Go core** (`native/findz-go`),
which is why it has no bin; `kisaki` runs duplicate detection and disk analysis on the native
czkawka Rust core and is the deepest node at 24 test files; `classq` / `linku` / `sleept` promise
their terminal commands in the manifest itself.

</details>

## Gates

<p align="center">
  <img src="./assets/readme/gates.svg" width="100%" alt="The 14 steps of pnpm test in execution order; CI runs 6 of them. The 15th cell is scripts/check-brand.mjs, dashed in rose because it runs and can be falsified but is deliberately not wired into the chain.">
</p>

One rule: **every gauge needs a positive control** — a case that must turn red when the defence is
switched off. A criterion without a control does not exist, and expected values may never be
produced by calling the function under test one more time. `scripts/check-brand.mjs` (the brand red
line) runs and falsifies correctly, but is **deliberately not wired into `pnpm test` or CI**: drawing
that line now would paint it across files another lane is still porting (`AGENTS.md:82-84`).

## Quick start

```bash
pnpm install --frozen-lockfile

pnpm host              # DSH_HOME and the port are already baked into the script
pnpm plugin:add <absolute path to plugins/xxx>
pnpm profile:dump | head -40
```

Route every `dsh` call through these scripts — **do not type a bare `dsh`**. The development host
and the everyday host must use different `DSH_HOME` values, so test conversations never appear in
the operator's real interface. Note that a profile does **not** isolate sessions: DSH stores them by
cwd under `$DSH_HOME/sessions/<cwd-slug>/`.

Run one package's unit tests (another lane is often writing in this repo, so a full `pnpm test` is
not attributable):

```bash
pnpm --filter @hibernalglow/xaihi-kisaki test:unit
```

## Terminal face and desktop shell

- 26 nodes ship their own bin (`lib/cli.js`); `findz` is the exception.
- `packages/cli` and `packages/logging` — home of the aggregate CLI and `xlogs` — are excluded from
  the workspace (`pnpm-workspace.yaml:19-21`), so the aggregate face does not start.
- The interactive legs, **measured today** (`node scripts/check-tui-face.mjs`, rc=0, 2026-10-09): of the
  27 packages one has no terminal face yet (`findz` has no bin), and the 52 legs grade
  **works 48 / honest refusal 4 / vague refusal 0 / crashed 0** — most `ui` / `gd` commands do start and
  exit cleanly when stdin is not a TTY, while four refuse loudly and name the missing seam. But
  **zero packages route through the shared probe** (`probeTerminalRuntime`): it currently has exactly
  one referencing consumer, the aggregate CLI (`packages/cli/src/index.ts:125`), and no hits inside
  node packages.
- Command *promises* are a separate matter: only 3 of the 26 packages with a terminal face promise
  any CLI command in their manifest, and the 23 danger-gated packages are **deliberately untouched**
  by that gauge (`docs/stages/cli-command-promises-2026-10-07.md:184-191`).
- The desktop shell lives in `desktop/`: `desktop/dsh` is an upstream submodule (pinned in
  `desktop/UPSTREAM_PIN`), our delta is `desktop/patches/dsh/*.patch`, replayed by
  `node desktop/sync-dsh.mjs` (ADR-0011). Any capability only our shell supports must
  **detect → degrade → read the degraded state back on screen**. Under the official desktop shell and
  `dsh web` features may degrade; they may not crash, stay silent, or fake data.

## Not wired yet

Recorded here so nothing reads as available when it is not:

- Platform optional-dependency packages `@hibernalglow/xaihi-<node>-<platform>-<arch>` — **none
  published so far** (`CONTEXT.md:65`).
- `packages/ui-kit` is retired (ADR-0006); its `package.json` still advertises "Material 3
  components". That is residue, not a roadmap item.
- The version gate accepts only exact values: every `@deepseek-ai/dsh*` must equal `0.2.0-rc.2`
  (`scripts/check-pins.mjs:15`). Several packages on npm still point `latest` at `0.0.1-rc.1`, so a
  bare `pnpm add` would quietly downgrade the ecosystem onto an API generation that does not exist.

## Documentation

| Location | Contents |
| --- | --- |
| [`docs/adr/`](docs/adr) | Decisions — 19 files (0001–0020, no 0012) |
| [`docs/stages/`](docs/stages) | Stage delivery and forensics — 19 files: what changed / why / relation to the DSH API with `file:line` / follow-up work |
| [`CONTEXT.md`](CONTEXT.md) | Cross-module vocabulary: bundle, plugin, profile, node, manifest, remote, run |
| [`docs/upstream-proposals.md`](docs/upstream-proposals.md) | Where DSH cannot support a design ⇒ propose, never grow a private bypass around the gap |
| [`docs/roadmap.md`](docs/roadmap.md) | Roadmap |

## Theme and palette

The repository name and this entire visual system come from **Xaihi (赛希)**, an operator in
*Arknights: Endfield*. The hex values are not impressions: they were measured from the official
artwork's histogram, then assigned roles (measurement → UI translation).

| Role | Value | Provenance |
| --- | --- | --- |
| Background | `#0A1218` | Artwork darks `#030507` / `#15222E`, deepened for contrast |
| Foreground | `#DCECF3` | The frost white, measured directly |
| Primary | `#69B3C8` | The most frequent blue-cyan in the artwork (family of `#4C6C89`) |
| Bright | `#5DE6FE` | Measured saturated cluster; used only for routes and code values |
| Muted | `#7095AD` | Mid-tones of the artwork |
| Accent | `#D63C82` | The rose glitch blocks in the artwork; reserved for danger and "deliberately unwired" |

The graphic language borrows the same image: diagonally sheared cold planes, floating artifact
cards, and a binary ribbon — that string in the board footer really is the bytes of `xaihi.node`.
No original artwork is shipped in this repository; only its palette and compositional temperament.

## License

MIT © HibernalGlow — see [LICENSE](LICENSE).
