# @xiranite/logging

Shared structured logging and analysis for Xiranite.

## Storage

Production and development logs use the same directory:

- Windows: `%LOCALAPPDATA%\Xiranite\logs`
- macOS: `~/Library/Logs/Xiranite`
- Linux: `$XDG_STATE_HOME/xiranite/logs` or `~/.local/state/xiranite/logs`
- Override: `XIRANITE_LOG_DIR`

The Node transport uses `rotating-file-stream`. Active files end in
`.current.jsonl`; size-rotated files end in `.jsonl.gz`. Defaults are 10 MiB
per file, 100 retained files, and 200 MiB total history. Override these with
`XIRANITE_LOG_FILE_SIZE`, `XIRANITE_LOG_MAX_FILES`, and
`XIRANITE_LOG_MAX_SIZE`. The reader also recognizes gzip by its file header so
logs created by older releases with a misleading `.jsonl` suffix remain
readable.

## Levels

Severity numbers follow the OpenTelemetry ranges:

| Level | Number | Intended use |
| --- | ---: | --- |
| `trace` | 1 | Very high-volume execution detail |
| `debug` | 5 | Diagnostic state and branch decisions |
| `info` | 9 | Normal lifecycle and user-visible operations |
| `warn` | 13 | Recoverable degradation or invalid state |
| `error` | 17 | Failed operation requiring investigation |
| `fatal` | 21 | Process or subsystem cannot continue |

The frontend defaults to `info` in packaged and development builds. Set the
runtime level with `?log=debug`, local storage key `xiranite.log.level`, or:

```js
window.__xiraniteLog.setLevel("debug")
```

## Format and boundaries

Every physical line is exactly one strict JSON envelope. The schema is inspired
by the OpenTelemetry Logs Data Model and includes event, severity, resource,
scope, session, optional trace context, and normalized error fields. There are
no text headers or legacy compatibility records in a JSONL file.

- `@xiranite/logging`: browser-safe schema, JSONL parser, query, aggregation
- `@xiranite/logging/node`: rotating writer and filesystem reader
- `@xiranite/logging/cli`: `xlogs` command implementation
- `@xiranite/logging/tui`: OpenTUI renderer

The CLI, TUI, and a future GUI must call the root query/aggregation API rather
than implement their own parser.

## Analysis

```text
xlogs sessions
xlogs query --level warn --scope neoview --search decode
xlogs stats --since 2026-07-23T00:00:00Z
xlogs errors
xlogs show <event-id>
xlogs export --output incident.jsonl --session <session-id>
xlogs doctor
xlogs tail --level info
xlogs tui
```

The aggregate CLI exposes the same commands under `xiranite logs ...`.

The design follows OpenTelemetry for event semantics, JSON Lines for durable
interchange, `rotating-file-stream` for retention, Consola for frontend logger
ergonomics, and OpenTUI for terminal rendering.
