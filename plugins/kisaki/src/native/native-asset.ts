import { existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

export interface NativeBindingOptions {
  id?: string
  filename?: string
  overrideEnv?: string
  workspaceRoot?: string
  env?: NodeJS.ProcessEnv
}

export function prependNativeLibraryPath(bindingPath: string, env: NodeJS.ProcessEnv = process.env): void {
  const nativeDirectory = dirname(bindingPath)
  if (process.platform === "win32") {
    env.PATH = env.PATH ? `${nativeDirectory};${env.PATH}` : nativeDirectory
  } else if (process.platform === "darwin") {
    env.DYLD_LIBRARY_PATH = env.DYLD_LIBRARY_PATH ? `${nativeDirectory}:${env.DYLD_LIBRARY_PATH}` : nativeDirectory
  } else {
    env.LD_LIBRARY_PATH = env.LD_LIBRARY_PATH ? `${nativeDirectory}:${env.LD_LIBRARY_PATH}` : nativeDirectory
  }
}

export function resolveKisakiBindingPath(packageRoot?: string, env: NodeJS.ProcessEnv = process.env): string {
  // 1. Env overrides
  const envOverride = env.XAIHI_KISAKI_NATIVE_PATH?.trim()
    || env.CZKAWKA_NATIVE_PATH?.trim()
    || env.XIRANITE_CZKAWKA_NATIVE_PATH?.trim()
  if (envOverride && existsSync(envOverride)) return envOverride

  const platformKey = `${process.platform}-${process.arch}`
  const fileCandidates = [
    `xaihi-kisaki.${platformKey}.node`,
    `xiranite-czkawka.${platformKey}.node`,
  ]

  // 2. Search root paths
  const searchRoots: string[] = []
  if (packageRoot) {
    searchRoots.push(packageRoot)
    searchRoots.push(resolve(packageRoot, "..", ".."))
  }
  searchRoots.push(process.cwd())
  let cur = process.cwd()
  for (let i = 0; i < 5; i++) {
    searchRoots.push(cur)
    cur = dirname(cur)
  }

  for (const root of searchRoots) {
    for (const filename of fileCandidates) {
      const candidates = [
        join(root, "native", "artifacts", platformKey, filename),
        join(root, "native", filename),
        join(root, filename),
      ]
      for (const p of candidates) {
        if (existsSync(p)) return p
      }
    }
  }

  // Fallback to upstream artifact directory if present
  const upstreamPath = `/Users/glow/Base/Code/Freya/Xiranite/native/artifacts/${platformKey}/xiranite-czkawka.${platformKey}.node`
  if (existsSync(upstreamPath)) return upstreamPath

  throw new Error(`Xaihi Kisaki native binding not found for ${platformKey}.`)
}

export const resolveCzkawkaBindingPath = resolveKisakiBindingPath
