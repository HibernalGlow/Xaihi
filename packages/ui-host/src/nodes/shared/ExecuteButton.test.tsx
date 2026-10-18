// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"

import { DANGER_FUSE_MS, ExecuteButton } from "./ExecuteButton"
import { useWorkspaceStore } from "@/store/workspaceStore"

describe("ExecuteButton undo countdown window", () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      hazardMode: false,
      executeUndoWindowMs: 1000,
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.useRealTimers()
    useWorkspaceStore.setState({
      hazardMode: false,
      executeUndoWindowMs: 1000,
    })
  })

  it("exports DANGER_FUSE_MS defaulted to 1000ms (1 second)", () => {
    expect(DANGER_FUSE_MS).toBe(1000)
  })

  it("defaults to 1 second countdown fuse for dangerous actions", async () => {
    vi.useFakeTimers()
    const onExecute = vi.fn()
    render(
      <ExecuteButton
        dangerous
        label="清理垃圾"
        onExecute={onExecute}
      />,
    )

    const button = screen.getByRole("button", { name: "清理垃圾" })
    button.click()

    const trigger = button.closest("[data-phase]")
    expect(trigger?.getAttribute("data-phase")).toBe("armed")
    expect(onExecute).not.toHaveBeenCalled()

    // 999ms 未触发
    vi.advanceTimersByTime(999)
    expect(onExecute).not.toHaveBeenCalled()

    // 1000ms 触发提交
    vi.advanceTimersByTime(1)
    expect(onExecute).toHaveBeenCalledTimes(1)
  })

  it("can be cancelled within the undo window before committing", async () => {
    vi.useFakeTimers()
    const onExecute = vi.fn()
    render(
      <ExecuteButton
        dangerous
        label="删除文件"
        onExecute={onExecute}
      />,
    )

    const button = screen.getByRole("button", { name: "删除文件" })
    button.click()

    expect(button.closest("[data-phase]")?.getAttribute("data-phase")).toBe("armed")

    // 在倒计时结束前点击撤销
    vi.advanceTimersByTime(500)
    const undoButton = screen.getByRole("button", { name: "取消本次危险执行" })
    undoButton.click()

    expect(button.closest("[data-phase]")?.getAttribute("data-phase")).toBe("idle")
    vi.advanceTimersByTime(1000)
    expect(onExecute).not.toHaveBeenCalled()
  })

  it("reads custom executeUndoWindowMs from workspace store", async () => {
    vi.useFakeTimers()
    useWorkspaceStore.setState({ executeUndoWindowMs: 2500 })
    const onExecute = vi.fn()

    render(
      <ExecuteButton
        dangerous
        label="执行重命名"
        onExecute={onExecute}
      />,
    )

    const button = screen.getByRole("button", { name: "执行重命名" })
    button.click()

    expect(button.closest("[data-phase]")?.getAttribute("data-phase")).toBe("armed")

    // 1000ms 时尚未结束（因为自定义为 2500ms）
    vi.advanceTimersByTime(1000)
    expect(onExecute).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1499)
    expect(onExecute).not.toHaveBeenCalled()

    // 2500ms 到时触发
    vi.advanceTimersByTime(1)
    expect(onExecute).toHaveBeenCalledTimes(1)
  })

  it("prioritizes explicit undoWindow prop over store preference", async () => {
    vi.useFakeTimers()
    useWorkspaceStore.setState({ executeUndoWindowMs: 2000 })
    const onExecute = vi.fn()

    render(
      <ExecuteButton
        dangerous
        undoWindow={500}
        label="特殊操作"
        onExecute={onExecute}
      />,
    )

    const button = screen.getByRole("button", { name: "特殊操作" })
    button.click()

    expect(button.closest("[data-phase]")?.getAttribute("data-phase")).toBe("armed")

    vi.advanceTimersByTime(499)
    expect(onExecute).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onExecute).toHaveBeenCalledTimes(1)
  })

  it("executes immediately without fuse when action is not dangerous or under hazardMode", async () => {
    const onExecuteNonDanger = vi.fn()
    const { rerender } = render(
      <ExecuteButton
        dangerous={false}
        label="预演分析"
        onExecute={onExecuteNonDanger}
      />,
    )

    const nonDangerButton = screen.getByRole("button", { name: "预演分析" })
    nonDangerButton.click()
    expect(onExecuteNonDanger).toHaveBeenCalledTimes(1)

    // Hazard 上膛后，危险动作也直接执行
    useWorkspaceStore.setState({ hazardMode: true })
    const onExecuteHazard = vi.fn()
    rerender(
      <ExecuteButton
        dangerous
        label="强制格式化"
        onExecute={onExecuteHazard}
      />,
    )

    const hazardButton = screen.getByRole("button", { name: "强制格式化" })
    hazardButton.click()
    expect(onExecuteHazard).toHaveBeenCalledTimes(1)
  })
})
