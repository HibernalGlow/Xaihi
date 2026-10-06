import { FileArchive, FolderOpen, PackageOpen } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { BandiaMode } from "./types"

export interface BandiaModeMeta {
  value: BandiaMode
  label: string
  shortLabel: string
  description: string
  icon: LucideIcon
}

export const MODES: BandiaModeMeta[] = [
  {
    value: "extract",
    label: "批量解压",
    shortLabel: "解压",
    description: "读取压缩包路径，使用 Bandizip 解压并生成路径映射。",
    icon: FileArchive,
  },
  {
    value: "compress",
    label: "批量压缩",
    shortLabel: "压缩",
    description: "读取文件夹或文件路径，压缩为 zip / 7z 归档。",
    icon: FolderOpen,
  },
  {
    value: "repack",
    label: "重打包",
    shortLabel: "重打包",
    description: "使用解压得到的映射，把目录重新压回对应归档。",
    icon: PackageOpen,
  },
]

export const DEFAULT_OUTPUT_PREFIX = "[extract] "
