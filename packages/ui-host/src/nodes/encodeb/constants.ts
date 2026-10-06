import { FileText, ScanSearch, ShieldAlert } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { EncodebTransform } from "@xiranite/node-encodeb/core"
import type { EncodebAction, EncodebPreset, EncodebStrategy } from "./types"

export interface EncodebPresetMeta {
  value: EncodebPreset
  label: string
  shortLabel: string
  srcEncoding?: string
  dstEncoding?: string
  transform: EncodebTransform
  description: string
  example: string
}

export const PRESETS: EncodebPresetMeta[] = [
  {
    value: "auto",
    label: "自动判断",
    shortLabel: "Auto",
    srcEncoding: "auto",
    dstEncoding: "auto",
    transform: "auto",
    description: "逐个名称保守判断；不确定时保持原样，建议优先使用。",
    example: "ã‚» → セ；#U30BB → セ；╓╨╬─ → 中文",
  },
  {
    value: "cn",
    label: "中文",
    shortLabel: "CN",
    srcEncoding: "cp437",
    dstEncoding: "cp936",
    transform: "recode",
    description: "ZIP 常见 cp437 字节按 GBK/CP936 还原。",
    example: "╓╨╬─.txt → 中文.txt",
  },
  {
    value: "jp",
    label: "日文",
    shortLabel: "JP",
    srcEncoding: "cp437",
    dstEncoding: "cp932",
    transform: "recode",
    description: "ZIP 常见 cp437 字节按 Shift-JIS/CP932 还原。",
    example: "âeâXâg.txt → テスト.txt",
  },
  {
    value: "kr",
    label: "韩文",
    shortLabel: "KR",
    srcEncoding: "cp437",
    dstEncoding: "cp949",
    transform: "recode",
    description: "ZIP 常见 cp437 字节按 EUC-KR/CP949 还原。",
    example: "╟╤▒█.txt → 한글.txt",
  },
  {
    value: "jp_from_cn",
    label: "日文（GBK 乱码）",
    shortLabel: "GBK→SJIS",
    srcEncoding: "cp936",
    dstEncoding: "cp932",
    transform: "recode",
    description: "恢复被中文 GBK/CP936 错误解释的 Shift-JIS 文件名。",
    example: "僥僗僩.txt → テスト.txt",
  },
  {
    value: "jp_iso2022_from_cn",
    label: "日文（ISO-2022-JP）",
    shortLabel: "GBK→JIS",
    srcEncoding: "cp936",
    dstEncoding: "iso-2022-jp",
    transform: "recode",
    description: "兼容旧工具的日文2模式：GBK 字节按 ISO-2022-JP 解码。",
    example: "仅用于旧日文2来源；结果不确定时不要执行修复",
  },
  {
    value: "latin1_utf8",
    label: "UTF-8 拉丁乱码",
    shortLabel: "1252→UTF8",
    srcEncoding: "windows-1252",
    dstEncoding: "utf8",
    transform: "recode",
    description: "将 ã‚» 一类 Windows-1252/UTF-8 mojibake 恢复为原文字。",
    example: "ã‚»ãƒ¼ãƒ©ãƒ¼.txt → セーラー.txt",
  },
  {
    value: "hash_u",
    label: "#U 转义",
    shortLabel: "#Uxxxx",
    srcEncoding: "unicode-escape",
    dstEncoding: "unicode",
    transform: "decode-hash-u",
    description: "将 #U30BB 一类 Unicode 码点转义恢复成真实字符。",
    example: "#U30BB#U30FC#U30E9#U30FC.txt → セーラー.txt",
  },
  {
    value: "middle_dot",
    label: "日文间隔点",
    shortLabel: "・→·",
    srcEncoding: "U+30FB",
    dstEncoding: "U+00B7",
    transform: "normalize-middle-dot",
    description: "兼容旧工具：把日文间隔点“・”规范为中点“·”。",
    example: "魔法・少女.txt → 魔法·少女.txt",
  },
  {
    value: "custom",
    label: "自定义",
    shortLabel: "Custom",
    transform: "recode",
    description: "手动指定源编码和目标编码。",
    example: "已知乱码产生链路时，填写“当前显示编码 → 原始编码”",
  },
]

export interface EncodebStrategyMeta {
  value: EncodebStrategy
  label: string
  shortLabel: string
  description: string
}

export const STRATEGIES: EncodebStrategyMeta[] = [
  {
    value: "replace",
    label: "原地重命名",
    shortLabel: "Replace",
    description: "直接改名原文件或目录，适合确认预览无误后执行。",
  },
  {
    value: "copy",
    label: "复制副本",
    shortLabel: "Copy",
    description: "保留原文件，输出转码后的副本。",
  },
]

export interface EncodebActionMeta {
  value: EncodebAction
  label: string
  icon: LucideIcon
}

export const ACTIONS: EncodebActionMeta[] = [
  { value: "find", label: "扫描乱码", icon: ScanSearch },
  { value: "preview", label: "预览映射", icon: FileText },
  { value: "recover", label: "执行修复", icon: ShieldAlert },
]
