#!/usr/bin/env node

/**
 * Snapshots every termcn OpenTUI registry item without adding it to the
 * runtime bundle. The snapshot is intentionally source-of-truth material for
 * future component selection; node screens import only the components they
 * actually use through the terminal/opentui boundary.
 */
import { mkdir, rm, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { join } from "node:path"

const registryUrl = "https://termcn.dev/r/registry.json"
const destination = fileURLToPath(new URL("../termcn-registry/opentui/", import.meta.url))
async function fetchJson(url) {
  let failure
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.json()
    } catch (error) {
      failure = error
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
    }
  }
  throw new Error(`Unable to download ${url}: ${failure}`)
}

const registry = await fetchJson(registryUrl)
const items = registry.items.filter((item) => item.name.startsWith("opentui/"))

await rm(destination, { recursive: true, force: true })
await mkdir(destination, { recursive: true })

const results = []
for (const item of items) {
  const snapshot = await fetchJson(`https://termcn.dev/r/${item.name}.json`)
  const filename = `${item.name.slice("opentui/".length)}.json`
  await writeFile(join(destination, filename), `${JSON.stringify(snapshot, null, 2)}\n`)
  results.push({ name: item.name, type: item.type, title: item.title, description: item.description })
}

await writeFile(join(destination, "manifest.json"), `${JSON.stringify({
  source: registryUrl,
  syncedAt: new Date().toISOString(),
  count: results.length,
  items: results,
}, null, 2)}\n`)

console.log(`Snapshotted ${results.length} @termcn/opentui items in ${destination}`)
