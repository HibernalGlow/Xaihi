import { parse } from "csv-parse/browser/esm"
import { parse as parseSync } from "csv-parse/browser/esm/sync"

export interface EfuRecord {
  filename: string
  size?: string
  dateModified?: string
  dateCreated?: string
  attributes?: string
}

const EFU_PARSE_OPTIONS = {
  bom: true,
  skip_empty_lines: true,
  relax_column_count: true,
} as const

/** Decode the encodings emitted by Everything's EFU exporter. */
export function decodeEfuBytes(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  return new TextDecoder(detectEfuEncoding(view)).decode(view)
}

/** Parse a complete Everything File List. Prefer streamEfuRecords for large files. */
export function parseEfuRecords(text: string): EfuRecord[] {
  const rows = parseSync(text, EFU_PARSE_OPTIONS) as unknown[][]
  return efuRecordsFromRows(rows)
}

/** Parse an EFU byte stream without retaining the source text or parsed rows. */
export async function* streamEfuRecords(
  source: AsyncIterable<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<EfuRecord> {
  const parser = parse(EFU_PARSE_OPTIONS)
  let parseError: unknown
  let ended = false
  let wake: (() => void) | undefined
  const notify = () => {
    wake?.()
    wake = undefined
  }
  parser.on("readable", notify)
  parser.on("error", (error) => {
    parseError = error
    notify()
  })
  parser.on("end", () => {
    ended = true
    notify()
  })
  const stop = new AbortController()
  let pumpError: unknown
  const pump = pumpDecodedEfu(source, parser, signal, stop.signal).catch((error) => {
    pumpError = error
    parser.end()
    notify()
  })
  let header: EfuHeader | undefined
  try {
    while (true) {
      signal?.throwIfAborted()
      const row = parser.read() as unknown[] | null
      if (!row) {
        if (parseError) throw parseError
        if (ended) break
        await new Promise<void>((resolve) => { wake = resolve })
        continue
      }
      if (!header) {
        header = efuHeader(row)
        continue
      }
      const record = efuRecord(header, row)
      if (record) yield record
    }
    await pump
    if (pumpError) throw pumpError
    if (!header) throw new Error("EFU file is empty.")
  } finally {
    stop.abort()
    await pump
  }
}

interface EfuHeader {
  filename: number
  size: number
  dateModified: number
  dateCreated: number
  attributes: number
}

function efuRecordsFromRows(rows: unknown[][]): EfuRecord[] {
  const headerRow = rows.shift()
  if (!headerRow) throw new Error("EFU file is empty.")
  const header = efuHeader(headerRow)
  return rows.flatMap((row) => {
    const record = efuRecord(header, row)
    return record ? [record] : []
  })
}

function efuHeader(row: unknown[]): EfuHeader {
  const names = row.map((value) => String(value ?? "").trim().toLowerCase())
  const filename = names.indexOf("filename")
  if (filename < 0) throw new Error("EFU file is missing the Filename column.")
  return {
    filename,
    size: names.indexOf("size"),
    dateModified: names.indexOf("date modified"),
    dateCreated: names.indexOf("date created"),
    attributes: names.indexOf("attributes"),
  }
}

function efuRecord(header: EfuHeader, row: unknown[]): EfuRecord | undefined {
  const filename = field(row, header.filename)?.trim()
  if (!filename) return undefined
  return {
    filename,
    ...optionalField("size", row, header.size),
    ...optionalField("dateModified", row, header.dateModified),
    ...optionalField("dateCreated", row, header.dateCreated),
    ...optionalField("attributes", row, header.attributes),
  }
}

function field(row: unknown[], index: number): string | undefined {
  return index < 0 || row[index] === undefined ? undefined : String(row[index])
}

function optionalField<K extends Exclude<keyof EfuRecord, "filename">>(
  name: K,
  row: unknown[],
  index: number,
): Partial<Pick<EfuRecord, K>> {
  const value = field(row, index)?.trim()
  return value ? { [name]: value } as Pick<EfuRecord, K> : {}
}

async function pumpDecodedEfu(
  source: AsyncIterable<Uint8Array>,
  parser: ReturnType<typeof parse>,
  signal?: AbortSignal,
  stopSignal?: AbortSignal,
): Promise<void> {
  try {
    for await (const text of decodeEfuChunks(source, signal)) {
      signal?.throwIfAborted()
      if (stopSignal?.aborted) return
      if (!parser.write(text)) await waitForParserDrain(parser, stopSignal)
    }
  } finally {
    parser.end()
  }
}

async function waitForParserDrain(parser: ReturnType<typeof parse>, stopSignal?: AbortSignal): Promise<void> {
  if (stopSignal?.aborted) return
  await new Promise<void>((resolve, reject) => {
    let settled = false
    const cleanup = () => {
      parser.removeListener("drain", resume)
      parser.removeListener("end", resume)
      parser.removeListener("error", fail)
      stopSignal?.removeEventListener("abort", resume)
    }
    const resume = () => { if (settled) return; settled = true; cleanup(); resolve() }
    const fail = (error: Error) => { if (settled) return; settled = true; cleanup(); reject(error) }
    parser.once("drain", resume)
    parser.once("end", resume)
    parser.once("error", fail)
    stopSignal?.addEventListener("abort", resume, { once: true })
  })
}

async function* decodeEfuChunks(
  source: AsyncIterable<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  let decoder: ReturnType<typeof createEfuDecoder> | undefined
  let prefix: Uint8Array<ArrayBufferLike> = new Uint8Array()
  for await (const chunk of source) {
    signal?.throwIfAborted()
    let bytes = chunk
    if (!decoder) {
      prefix = concatBytes(prefix, bytes)
      if (prefix.length < 2) continue
      decoder = createEfuDecoder(prefix)
      bytes = prefix
    }
    const text = decoder.decode(bytes, { stream: true })
    if (text) yield text
  }
  const tail = decoder?.decode() ?? ""
  if (tail) yield tail
}

function createEfuDecoder(bytes: Uint8Array) {
  return new TextDecoder(detectEfuEncoding(bytes))
}

function detectEfuEncoding(bytes: Uint8Array): "utf-8" | "utf-16le" | "utf-16be" {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return "utf-16le"
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return "utf-16be"
  return "utf-8"
}

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  if (!left.length) return right
  const output = new Uint8Array(left.length + right.length)
  output.set(left)
  output.set(right, left.length)
  return output
}
