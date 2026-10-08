#!/usr/bin/env node
import {
  hasPipedInput,
  nodeCliName,
  readStdinLines,
  writeError,
  writeJson,
  writeLine,
  type CliCommand,
  type CliHost,
} from "./cli-support.ts"
import { runInteractionCli, runTerminalUi, type TerminalPreferenceController, type TerminalPreferenceValues } from "@hibernalglow/xaihi-cli-runtime/terminal"
import { resolveTerminalLanguage, type TerminalLanguage } from "@hibernalglow/xaihi-cli-runtime/i18n"
import type { TerminalInteractionDefinition } from "@hibernalglow/xaihi-cli-runtime/interaction"
import type { KisakiData, KisakiInput, KisakiResult, KisakiTerminalTool, KisakiTool } from "./core.js"
import { runKisaki } from "./core.js"
import { createNodeKisakiRuntime, openKisakiPath } from "./platform.js"
import { createKisakiInteractionSchema, kisakiTerminalTools } from "./interaction.js"
import { help } from "./help.js"
import { createKisakiOperationInput, KISAKI_CLI_VALUE_FLAGS, parseKisakiCliOptions } from "./tool-options.js"
import { buildKisakiAnalysis } from "./analysis.js"
import { formatKisakiActivityMessage } from "./activity-log.js"
import { kisakiScanPresetToValues, type KisakiScanPreset } from "./scan-presets.js"
import type { KisakiInteractionValues } from "./interaction.js"
import { parseKisakiExtensionTokens, parseKisakiList, serializeKisakiExtensionTokens } from "./source-inputs.js"

const CLI_NAME = nodeCliName("kisaki")
const TERMINAL_TOOLS = kisakiTerminalTools

interface KisakiConfig {
  tool?: KisakiTool
  recursive?: boolean
  use_cache?: boolean
  save_also_as_json?: boolean
  delete_outdated_cache?: boolean
  cache_folder_path?: string
  config_folder_path?: string
  duplicate_minimal_hash_cache_size_kib?: number
  duplicate_minimal_prehash_cache_size_kib?: number
  hash_type?: "crc32" | "xxh3" | "blake3"
  check_method?: "name" | "size" | "size-and-name" | "hash"
  similarity?: number
  scan_presets?: KisakiScanPreset[]
  active_scan_preset_id?: string
}

export const cli: CliCommand = { name: CLI_NAME, description: help.short, run: (args, host) => runProgram(args, host) }

export async function runProgram(args = process.argv.slice(2), host: CliHost = defaultHost()): Promise<void> {
  const language = resolveTerminalLanguage(valueFor(args, "--lang"), host.env)
  try {
    await runInteractionCli({
      args,
      host,
      cliName: CLI_NAME,
      loadContext: async () => ({ preferences: { theme: "default", mode: "standard" }, value: {} }),
      createDefinition: (defaults, lang) => createKisakiHostDefinition(host, defaults as KisakiConfig, lang),
      runPipe,
      runGuide: async (_definition, _options) => {
        // Guided interaction stub
      },
      runUi: async (definition, options) => {
        await runTerminalUi(definition, options)
      },
      loadScreen: async () => (await import("./Tui.js")).KisakiTui,
      createPreferences: (_defaults, current) => preferences(host, current),
      reexecEntrypoint: process.argv[1],
      help,
    })
  } catch (error) {
    writeError(host, error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

async function runPipe(args: string[], host: CliHost): Promise<void> {
  if (!args.length) {
    writeLine(host, `${CLI_NAME} ui | gd | scan <tool> <directories...> | delete <paths...> | move <destination> <paths...> | rename <extension> <paths...> | save <output> <paths...>`)
    return
  }
  const command = args[0] ?? "scan", json = args.includes("--json"), language = resolveTerminalLanguage(valueFor(args, "--lang"), host.env)
  let input: KisakiInput
  if (command === "scan" || isTerminalTool(command)) {
    const explicitTool = command === "scan" ? args[1] : command
    if (command === "scan" && explicitTool && !explicitTool.startsWith("--") && !isTerminalTool(explicitTool)) {
      throw new Error(`Unsupported Kisaki tool: ${explicitTool}`)
    }
    const configuredTool = "duplicate-files"
    const tool = isTerminalTool(explicitTool) ? (explicitTool as KisakiTool) : configuredTool
    const offset = command === "scan" ? 2 : 1
    let roots = positional(args.slice(offset), SCAN_VALUE_FLAGS)
    if (roots.includes("-")) roots = roots.filter((path) => path !== "-").concat(await readStdinLines(host.stdin))
    else if (!roots.length && hasPipedInput(host.stdin) && Symbol.asyncIterator in Object(host.stdin)) roots = await readStdinLines(host.stdin)
    input = {
      action: "scan",
      tool,
      includedDirectories: roots,
      includedDirectoriesReferenced: listFor(args, "--reference"),
      excludedDirectories: listFor(args, "--exclude-dir"),
      excludedItems: listFor(args, "--exclude-item"),
      recursive: !args.includes("--no-recursive"),
      useCache: !args.includes("--no-cache"),
      saveAlsoAsJson: args.includes("--save-cache-json"),
      deleteOutdatedCache: !args.includes("--keep-outdated-cache"),
      cacheFolderPath: valueFor(args, "--cache-folder"),
      configFolderPath: valueFor(args, "--config-folder"),
      duplicateMinimalHashCacheSizeKiB: numberFor(args, "--min-hash-cache-kib"),
      duplicateMinimalPrehashCacheSizeKiB: numberFor(args, "--min-prehash-cache-kib"),
      threadCount: numberFor(args, "--threads"),
      allowedExtensions: extensionsFor(args, "--allow"),
      excludedExtensions: extensionsFor(args, "--exclude-ext"),
      minimumFileSize: numberFor(args, "--min-size"),
      maximumFileSize: numberFor(args, "--max-size"),
      filterText: valueFor(args, "--filter"),
      ...parseKisakiCliOptions(args),
    }
  } else if (command === "delete") {
    input = createKisakiOperationInput("delete", {
      tool: operationToolFor(args),
      selectedPaths: positional(args.slice(1), OPERATION_VALUE_FLAGS),
      deleteMode: args.includes("--permanent") ? "permanent" : "trash",
      dryRun: !args.includes("--live"),
    })
  } else if (command === "move") {
    input = createKisakiOperationInput("move", {
      tool: operationToolFor(args),
      destinationDirectory: args[1],
      selectedPaths: positional(args.slice(2), OPERATION_VALUE_FLAGS),
      copyMode: args.includes("--copy"),
      preserveStructure: args.includes("--preserve-structure"),
      conflictPolicy: valueFor(args, "--conflict"),
      dryRun: !args.includes("--live"),
    })
  } else if (command === "rename") {
    input = createKisakiOperationInput("rename", {
      tool: operationToolFor(args),
      renameItems: positional(args.slice(2), OPERATION_VALUE_FLAGS).map((path) => ({ path, properExtension: args[1] ?? "" })),
      conflictPolicy: valueFor(args, "--conflict"),
      dryRun: !args.includes("--live"),
    })
  } else if (command === "save") {
    input = createKisakiOperationInput("save", {
      tool: operationToolFor(args),
      outputPath: args[1],
      selectedPaths: positional(args.slice(2), OPERATION_VALUE_FLAGS),
      outputFormat: args.includes("--csv") ? "csv" : "json",
      exportScope: valueFor(args, "--scope"),
      dryRun: false,
    })
  } else {
    writeLine(host, `Unknown command: ${command}`)
    process.exitCode = 2
    return
  }

  const runtime = createNodeKisakiRuntime()
  const result = await runKisaki(input, runtime, json ? undefined : (event) => {
    writeLine(host, formatKisakiActivityMessage("info", event.message, event.progress))
  })

  if (!result) return
  if (json) {
    writeJson(host, result)
  } else {
    for (const line of formatKisakiPipeResult(result, language)) writeLine(host, line)
    for (const entry of result.data?.entries.slice(0, 200) ?? []) {
      writeLine(
        host,
        entry.status
          ? `${entry.status}\t${entry.path}${entry.secondaryPath ? `\t→ ${entry.secondaryPath}` : ""}${entry.error ? `\t${entry.error}` : ""}`
          : `${entry.groupId + 1}\t${entry.size}\t${entry.path}${entry.detail ? `\t${entry.detail}` : ""}`,
      )
    }
  }
  if (!result.success) process.exitCode = 1
}

export function createKisakiHostDefinition(host: CliHost, defaults: KisakiConfig = {}, language: TerminalLanguage = "zh"): KisakiHostDefinition {
  const tool = isTerminalTool(defaults.tool) ? defaults.tool : "duplicate-files"
  const activePreset = defaults.scan_presets?.find((preset) => preset.id === defaults.active_scan_preset_id)
  const presetValues = activePreset ? (kisakiScanPresetToValues(activePreset) as Partial<KisakiInteractionValues>) : {}
  const schema = createKisakiInteractionSchema(
    {
      tool,
      recursive: defaults.recursive,
      useCache: defaults.use_cache,
      hashType: defaults.hash_type,
      checkMethod: defaults.check_method,
      similarity: defaults.similarity,
      ...presetValues,
    },
    language,
  )
  const runtime = createNodeKisakiRuntime()
  return {
    schema,
    run: async (input, onEvent) => {
      return runKisaki(input, runtime, onEvent ? (e) => onEvent({ type: e.type, message: e.message, progress: e.progress }) : undefined)
    },
    pause: async () => {},
    resume: async () => {},
    cancel: async () => {},
    openPath: openKisakiPath,
  }
}

export interface KisakiHostDefinition extends TerminalInteractionDefinition<KisakiInput, KisakiResult> {
  openPath: (path: string) => Promise<void>
}

function preferences(_host: CliHost, current: TerminalPreferenceValues): TerminalPreferenceController {
  return {
    nodeId: "kisaki",
    current,
    async save() {},
    async restore() {
      return { theme: "default", defaultMode: "standard", language: "zh" }
    },
  }
}

export function formatKisakiPipeResult(result: KisakiResult, language: TerminalLanguage): string[] {
  const data = result.data
  if (!data) return [result.message]
  const zh = language === "zh", none = zh ? "无" : "none"
  if (data.action !== "scan") {
    return [
      zh
        ? `${operationLabel(data.action, true)}：影响 ${data.affectedCount} 项，错误 ${data.errorCount} 项。`
        : `${operationLabel(data.action, false)}: ${data.affectedCount} affected, ${data.errorCount} errors.`,
    ]
  }
  const analysis = buildKisakiAnalysis(data.groups, [], data.tool)
  const lines = [
    data.stopped
      ? zh
        ? `扫描已停止；保留 ${data.fileCount} 个部分结果。`
        : `Scan stopped; retained ${data.fileCount} partial item(s).`
      : zh
        ? `找到 ${data.fileCount} 项，共 ${data.groupCount} 组。`
        : `Found ${data.fileCount} item(s) in ${data.groupCount} group(s).`,
    `${zh ? "格式" : "Formats"}: ${analysis.formats.slice(0, 8).map((item) => `${item.format}=${item.count}/${item.bytes}B`).join(", ") || none}`,
  ]
  if (analysis.similarities.length) {
    lines.push(
      `${zh ? "相似度" : "Similarity"}: ${analysis.similarities.map((item) => `${similarityLabel(item.level, language)}=${item.count}`).join(", ")}`,
    )
  }
  if (data.tool === "similar-images") {
    lines.push(
      `${zh ? "相似文件夹" : "Similar folders"}: ${data.similarFolders?.map((item) => `${item.path}=${item.count}`).join(", ") || none}`,
    )
  }
  return lines
}

const SIMILARITY_LABELS_EN = {
  original: "Original / identical",
  "very-high": "Very high",
  high: "High",
  medium: "Medium",
  small: "Small",
  "very-small": "Very small",
  minimal: "Minimal",
} as const

function similarityLabel(level: keyof typeof SIMILARITY_LABELS_EN, language: TerminalLanguage): string {
  return language === "zh"
    ? ({ original: "原始/相同", "very-high": "极高", high: "高", medium: "中等", small: "较小", "very-small": "很小", minimal: "最低" } as const)[level]
    : SIMILARITY_LABELS_EN[level]
}

function operationLabel(action: NonNullable<KisakiResult["data"]>["action"], zh: boolean): string {
  if (action === "delete") return zh ? "删除" : "Delete"
  if (action === "move") return zh ? "移动/复制" : "Move/copy"
  if (action === "rename") return zh ? "修正扩展名" : "Fix extension"
  return zh ? "导出" : "Export"
}

const SCAN_VALUE_FLAGS = new Set([
  ...KISAKI_CLI_VALUE_FLAGS,
  "--reference",
  "--exclude-dir",
  "--exclude-item",
  "--allow",
  "--exclude-ext",
  "--min-size",
  "--max-size",
  "--threads",
  "--filter",
  "--cache-folder",
  "--config-folder",
  "--min-hash-cache-kib",
  "--min-prehash-cache-kib",
  "--lang",
])
const OPERATION_VALUE_FLAGS = new Set(["--conflict", "--scope", "--tool", "--lang"])

function positional(args: string[], valueFlags: Set<string>): string[] {
  return args.filter((arg, index) => !arg.startsWith("--") && !valueFlags.has(args[index - 1] ?? ""))
}

function valueFor(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : undefined
}

function valuesFor(args: string[], flag: string): string[] {
  return args.flatMap((value, index) => (value === flag && args[index + 1] !== undefined ? [args[index + 1]!] : []))
}

function listFor(args: string[], flag: string): string[] {
  return valuesFor(args, flag)
    .flatMap((value) => parseKisakiList(value))
    .filter((value, index, all) => all.indexOf(value) === index)
}

function extensionsFor(args: string[], flag: string): string | undefined {
  const values = valuesFor(args, flag).flatMap((value) => parseKisakiExtensionTokens(value))
  return values.length ? serializeKisakiExtensionTokens(values) : undefined
}

function numberFor(args: string[], flag: string): number | undefined {
  const value = valueFor(args, flag)
  if (value === undefined) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function isTerminalTool(value: string | undefined): boolean {
  return value !== undefined && TERMINAL_TOOLS.includes(value as KisakiTerminalTool)
}

function operationToolFor(args: string[]): KisakiTool | undefined {
  const value = valueFor(args, "--tool")
  if (value === undefined) return undefined
  if (!isTerminalTool(value)) throw new Error(`Unsupported Kisaki tool: ${value}`)
  return value as KisakiTool
}

const defaultHost = (): CliHost => ({
  cwd: process.cwd(),
  env: process.env,
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
})

if (process.argv[1] && /\bcli\.[jt]s$/.test(process.argv[1].replace(/\\/g, "/"))) await runProgram()
