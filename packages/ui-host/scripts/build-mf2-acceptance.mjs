import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { rspack } from '@rspack/core'
import documentConfig from '../rspack.document.mjs'
/** 单独输出正式入口，避免改写其他 lane 正在使用的 dist-ui。 */
export async function buildMf2Document() {
  const directory = await mkdtemp(path.join(tmpdir(), 'xaihi-mf2-document-'))
  try {
    const config = { ...documentConfig, output: { ...documentConfig.output, path: directory } }
    const compiler = rspack(config)
    await new Promise((resolve, reject) => compiler.run((error, stats) => compiler.close(() => {
      if (error || stats?.hasErrors()) reject(error ?? new Error(stats?.toString({ all: false, errors: true })))
      else { console.log(stats.toString({ all: false, errors: true, warnings: true, timings: true })); resolve() }
    })))
    return directory
  } catch (error) { await rm(directory, { recursive: true, force: true }); throw error }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.chdir(fileURLToPath(new URL('..', import.meta.url)))
  const directory = await buildMf2Document()
  await writeFile(path.join(directory, 'acceptance.json'), JSON.stringify({ directory }))
  console.log('XAIHI_MF2_DOCUMENT=' + directory)
}
