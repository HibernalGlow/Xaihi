import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { createHash } from 'node:crypto'

function containedFile(root, file) {
  const source = realpathSync(file)
  if (!source.startsWith(root + sep) || !statSync(source).isFile()) throw new Error('原生模块越出资源目录或不是文件')
  return source
}
/** staging 时解析历史文本指针；只接受源目录内的文件。 */
export function resolveNativeBinding(directory, filename) {
  const root = realpathSync(directory)
  let source = containedFile(root, resolve(root, filename))
  if (statSync(source).size < 4096) {
    const pointer = readFileSync(source, 'utf8').trim()
    // 小型二进制仍可能是合法 .node；只有单行 .node 路径才当成历史文本指针。
    if (/^[^\x00-\x1f]+\.node$/u.test(pointer)) source = containedFile(root, resolve(root, pointer))
  }
  if (!source.endsWith('.node')) throw new Error('原生模块不是 .node')
  return source
}

export function stageNativeResources({ repo, destination, native, platform = process.platform, arch = process.arch }) {
  const expand = value => value.replaceAll('{platform}', platform).replaceAll('{arch}', arch)
  const directory = resolve(repo, expand(native.directory))
  const filename = expand(native.binding)
  if (basename(filename) !== filename) throw new Error('原生模块文件名不能包含目录')
  if (!existsSync(directory)) throw new Error(`缺少 ${platform}-${arch} 原生资源：${directory}`)
  const root = realpathSync(directory)
  const binding = resolveNativeBinding(root, filename)
  const directories = [...new Set([root, dirname(binding)])]
  const files = [binding, ...directories.flatMap(dir => readdirSync(dir).filter(name => /\.(dylib|dll|so(?:\.\d+)*)$/i.test(name)).map(name => join(dir, name)))]
  const names = new Set()
  // 全部校验后再复制，避免半套资源被误当作可发布产物。
  const checked = files.map(file => {
    const source = containedFile(root, file)
    const name = file === binding ? filename : basename(file)
    if (names.has(name)) throw new Error(`原生依赖重名：${name}`)
    names.add(name)
    return { source, name }
  })
  mkdirSync(destination, { recursive: true })
  const manifest = checked.map(({ source, name }) => {
    copyFileSync(source, join(destination, name))
    return { name, bytes: statSync(source).size, sha256: createHash('sha256').update(readFileSync(source)).digest('hex') }
  })
  return { platform, arch, binding: join(destination, filename), files: manifest }
}
