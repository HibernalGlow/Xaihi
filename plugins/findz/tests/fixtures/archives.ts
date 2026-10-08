/**
 * 真归档夹具：在磁盘上造出**真的 ZIP/CBZ**，让实机内核去读它的中央目录与图像头。
 *
 * 为什么不用 `zipfile` 之类的依赖：本仓不为了夹具再拉一个包。ZIP 的 stored（不压缩）
 * 形态只有三段结构，而且 findz 的内核**不解压成员**（`findz-v2-design.md`：
 * "No member is extracted to disk"）——它只读中央目录里的名字与长度、再按需读有界前缀
 * 看 PNG 的 IHDR。所以 stored 足够，写起来还比压缩少一个变量。
 */

import { deflateRawSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    table[index] = value >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff]! ^ (value >>> 8)
  return (value ^ 0xffffffff) >>> 0
}

/**
 * 最小可解析的真 PNG：签名 + IHDR + 一行 IDAT + IEND。
 *
 * 内核读的是 IHDR 里的宽高，所以这里必须是真的 PNG 结构，不能只塞一段 "PNG" 字面量
 * —— 那样探针会"通过"在一个被它自己喂假的地方。
 */
export function pngBytes(width: number, height: number): Uint8Array {
  const chunk = (kind: string, payload: Uint8Array): Uint8Array => {
    const head = Buffer.alloc(4)
    head.writeUInt32BE(payload.length, 0)
    const body = Buffer.concat([Buffer.from(kind, 'latin1'), payload])
    const tail = Buffer.alloc(4)
    tail.writeUInt32BE(crc32(body), 0)
    return Buffer.concat([head, body, tail])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // truecolor
  // 一行像素 = 一个 filter 字节 + width 个 RGB 三元组。
  const scanlines = Buffer.alloc(height * (1 + width * 3))
  for (let row = 0; row < height; row += 1) {
    const offset = row * (1 + width * 3)
    scanlines[offset] = 0
    for (let column = 0; column < width; column += 1) scanlines[offset + 1 + column * 3] = 255
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateRawSync(scanlines)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** 一条要放进归档的成员。 */
export interface ArchiveMember {
  name: string
  bytes: Uint8Array
}

/** 把一个成员列表写成 stored（不压缩）ZIP 的字节。 */
export function zipBytes(members: readonly ArchiveMember[]): Uint8Array {
  const local: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const member of members) {
    const name = Buffer.from(member.name, 'utf8')
    const crc = crc32(member.bytes)
    const localHead = Buffer.alloc(30)
    localHead.writeUInt32LE(0x04034b50, 0)
    localHead.writeUInt16LE(20, 4)
    localHead.writeUInt16LE(0, 6)
    localHead.writeUInt16LE(0, 8) // stored
    localHead.writeUInt16LE(0, 10)
    localHead.writeUInt16LE(0, 12)
    localHead.writeUInt32LE(crc, 14)
    localHead.writeUInt32LE(member.bytes.length, 18)
    localHead.writeUInt32LE(member.bytes.length, 22)
    localHead.writeUInt16LE(name.length, 26)
    localHead.writeUInt16LE(0, 28)
    local.push(localHead, name, Buffer.from(member.bytes))

    const centralHead = Buffer.alloc(46)
    centralHead.writeUInt32LE(0x02014b50, 0)
    centralHead.writeUInt16LE(20, 4)
    centralHead.writeUInt16LE(20, 6)
    centralHead.writeUInt16LE(0, 8)
    centralHead.writeUInt16LE(0, 10)
    centralHead.writeUInt16LE(0, 12)
    centralHead.writeUInt16LE(0, 14)
    centralHead.writeUInt32LE(crc, 16)
    centralHead.writeUInt32LE(member.bytes.length, 20)
    centralHead.writeUInt32LE(member.bytes.length, 24)
    centralHead.writeUInt16LE(name.length, 28)
    centralHead.writeUInt16LE(0, 30)
    centralHead.writeUInt16LE(0, 32)
    centralHead.writeUInt16LE(0, 34)
    centralHead.writeUInt16LE(0, 36)
    centralHead.writeUInt32LE(0, 38)
    centralHead.writeUInt32LE(offset, 42)
    central.push(centralHead, name)

    offset += localHead.length + name.length + member.bytes.length
  }
  const centralBytes = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(members.length, 8)
  end.writeUInt16LE(members.length, 10)
  end.writeUInt32LE(centralBytes.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)
  return Buffer.concat([...local, centralBytes, end])
}

/**
 * 在 `root` 下造一个小归档库。
 *
 * 两个归档 + 一个非归档文件，成员尺寸与内容都是已知的（宽高刻意各不相同），
 * 这样断言可以钉住"读到的是真值"而不是"读到了某个数"。
 */
export function buildArchiveLibrary(root: string): { alpha: string, beta: string, notes: string } {
  mkdirSync(root, { recursive: true })
  const alpha = join(root, 'alpha.cbz')
  const beta = join(root, 'beta.zip')
  const notes = join(root, 'notes.txt')
  writeFileSync(
    alpha,
    zipBytes([
      { name: 'cover.png', bytes: pngBytes(120, 80) },
      { name: 'page/001.png', bytes: pngBytes(64, 64) },
    ]),
  )
  writeFileSync(beta, zipBytes([{ name: 'wide.png', bytes: pngBytes(300, 40) }]))
  writeFileSync(notes, 'not an archive\n', 'utf8')
  return { alpha, beta, notes }
}
