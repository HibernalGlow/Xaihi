import { Info } from "lucide-react"
import { buildKisakiSimilarityReference, KISAKI_SIMILARITY_HASH_SIZES } from "@hibernalglow/xaihi-kisaki/analysis"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { TableBody, TableCell, TableComponent, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type Translate = (key: string, fallback: string, vars?: Record<string, unknown>) => string

const REFERENCE = buildKisakiSimilarityReference()

export function KisakiSimilarityReferenceDialog({ t }: { t: Translate }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button aria-label={t("similarityReference.open", "打开相似度速查表")} size="icon-sm" variant="ghost">
          <Info />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("similarityReference.title", "相似度与 Hash Size 速查表")}</DialogTitle>
          <DialogDescription>{t("similarityReference.description", "差异值越小，文件越相似；范围与 Czkawka Core 使用的阈值一致。")}</DialogDescription>
        </DialogHeader>
        <div className="overflow-x-auto rounded-md border">
          <TableComponent className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead>{t("similarityReference.level", "等级")}</TableHead>
                {KISAKI_SIMILARITY_HASH_SIZES.map((hashSize) => <TableHead key={hashSize} className="font-mono">Hash {hashSize}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {REFERENCE.map((row) => (
                <TableRow key={row.level}>
                  <TableCell>{t(`analysis.levels.${row.level}`, row.label)}</TableCell>
                  {KISAKI_SIMILARITY_HASH_SIZES.map((hashSize) => <TableCell key={hashSize} className="font-mono tabular-nums">{row.ranges[hashSize]}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </TableComponent>
        </div>
      </DialogContent>
    </Dialog>
  )
}
