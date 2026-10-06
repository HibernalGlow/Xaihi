import { useState } from "react"
import { useTranslation } from "react-i18next"

type Op = "+" | "-" | "*" | "/" | null

export default function CalculatorModule() {
  const { t } = useTranslation()
  const [display, setDisplay] = useState("0")
  const [prev, setPrev] = useState<number | null>(null)
  const [op, setOp] = useState<Op>(null)
  const [fresh, setFresh] = useState(false)

  function input(d: string) {
    if (fresh) { setDisplay(d); setFresh(false); return }
    setDisplay(display === "0" ? d : display.length < 12 ? display + d : display)
  }

  function dot() {
    if (fresh) { setDisplay("0."); setFresh(false); return }
    if (!display.includes(".")) setDisplay(display + ".")
  }

  function setOperator(o: Op) {
    const cur = parseFloat(display)
    if (prev !== null && op && !fresh) {
      const res = compute(prev, cur, op)
      setDisplay(String(res))
      setPrev(res)
    } else {
      setPrev(cur)
    }
    setOp(o)
    setFresh(true)
  }

  function compute(a: number, b: number, o: Op): number {
    if (o === "+") return a + b
    if (o === "-") return a - b
    if (o === "*") return a * b
    if (o === "/") return b !== 0 ? a / b : NaN
    return b
  }

  function equals() {
    if (prev === null || op === null) return
    const cur = parseFloat(display)
    const res = compute(prev, cur, op)
    setDisplay(isNaN(res) ? t("module:calculator.error") : String(parseFloat(res.toPrecision(10))))
    setPrev(null)
    setOp(null)
    setFresh(true)
  }

  function clear() {
    setDisplay("0"); setPrev(null); setOp(null); setFresh(false)
  }

  function negate() { setDisplay(String(-parseFloat(display))) }
  function pct() { setDisplay(String(parseFloat(display) / 100)) }

  const btn = (label: string, onClick: () => void, variant: "primary" | "op" | "utility" | "default" = "default") => {
    const base = "h-10 font-mono text-sm font-medium rounded-sm transition-colors"
    const variants = {
      primary: "bg-primary text-primary-foreground hover:bg-primary/90",
      op: "bg-accent text-accent-foreground hover:bg-accent/80 border border-border/60 text-primary font-bold",
      utility: "bg-muted/60 text-muted-foreground hover:bg-muted",
      default: "bg-muted/40 text-foreground hover:bg-muted border border-border/40",
    }
    return (
      <button className={`${base} ${variants[variant]}`} onClick={onClick}>
        {label}
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-2 p-1 h-full">
      <div className="bg-muted/40 rounded border border-border/50 px-3 py-2 text-right">
        <div className="text-[10px] font-mono text-muted-foreground h-4">
          {prev !== null ? `${prev} ${op ?? ""}` : ""}
        </div>
        <div className="font-mono text-2xl font-bold text-foreground truncate">{display}</div>
      </div>
      <div className="grid grid-cols-4 gap-1 flex-1">
        {btn("AC", clear, "utility")}
        {btn("+/-", negate, "utility")}
        {btn("%", pct, "utility")}
        {btn("÷", () => setOperator("/"), "op")}
        {btn("7", () => input("7"))}
        {btn("8", () => input("8"))}
        {btn("9", () => input("9"))}
        {btn("×", () => setOperator("*"), "op")}
        {btn("4", () => input("4"))}
        {btn("5", () => input("5"))}
        {btn("6", () => input("6"))}
        {btn("−", () => setOperator("-"), "op")}
        {btn("1", () => input("1"))}
        {btn("2", () => input("2"))}
        {btn("3", () => input("3"))}
        {btn("+", () => setOperator("+"), "op")}
        <button
          className="col-span-2 h-10 font-mono text-sm bg-muted/40 text-foreground hover:bg-muted rounded-sm border border-border/40 transition-colors"
          onClick={() => input("0")}
        >0</button>
        {btn(".", dot)}
        {btn("=", equals, "primary")}
      </div>
    </div>
  )
}
