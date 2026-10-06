import { createReadStream } from "node:fs"

import { streamEfuRecords, type EfuRecord } from "./efu.js"

export async function* streamEfuFileRecords(
  path: string,
  signal?: AbortSignal,
): AsyncGenerator<EfuRecord> {
  yield* streamEfuRecords(createReadStream(path, { signal }), signal)
}
