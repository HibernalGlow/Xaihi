/**
 * Encodeb's repair presets: the encoding pairs the operator picks from, defined once.
 *
 * `ENCODEB_PRESETS` used to live only in `core.ts`, so `interaction.ts` — which turns a preset id into the
 * `srcEncoding`/`dstEncoding`/`transform` triple the host runs — had to value-import core, and `cli.ts` loads that
 * schema. One such edge evaluates the whole engine in the face process (ADR-0074 §5), which is why the table sits
 * here and `core.ts` forwards the name for the host bundle and every existing `./core.js` consumer. Same shape as
 * `sleept/src/schedule.ts`.
 *
 * A label table only: no path work, no transcoding — `platform.ts` owns chardet and iconv-lite.
 */
export const ENCODEB_PRESETS = {
  auto: { label: "Auto detect", srcEncoding: "auto", dstEncoding: "auto", transform: "auto", example: "ã‚» / #U30BB / ╓╨╬─ → detected text" },
  cn: { label: "Chinese", srcEncoding: "cp437", dstEncoding: "cp936", transform: "recode" },
  jp: { label: "Japanese", srcEncoding: "cp437", dstEncoding: "cp932", transform: "recode" },
  kr: { label: "Korean", srcEncoding: "cp437", dstEncoding: "cp949", transform: "recode" },
  jp_from_cn: { label: "Japanese from GBK mojibake", srcEncoding: "cp936", dstEncoding: "cp932", transform: "recode" },
  jp_iso2022_from_cn: { label: "ISO-2022-JP from GBK mojibake", srcEncoding: "cp936", dstEncoding: "iso-2022-jp", transform: "recode" },
  latin1_utf8: { label: "UTF-8 from Latin-1 mojibake", srcEncoding: "windows-1252", dstEncoding: "utf8", transform: "recode" },
  hash_u: { label: "Decode #Uxxxx escapes", srcEncoding: "unicode-escape", dstEncoding: "unicode", transform: "decode-hash-u" },
  middle_dot: { label: "Normalize Japanese middle dot", srcEncoding: "U+30FB", dstEncoding: "U+00B7", transform: "normalize-middle-dot" },
} as const
