//go:build !cshared

// findz-host —— ADR-0004 决定 2 的"薄进程边界"。
//
// 它不是内核的一部分。本目录其余 .go 是从 Xiranite 基线（tag `noxide`，提交
// `ccf465fe`）逐字搬来的，一个字节没动；`ffi.go` 只加了一行 `//go:build cshared`，
// 让同一份源码既能按上游的方式出 `-buildmode=c-shared` 的 DLL，也能出这里这个独立
// 可执行文件。
//
// 它只做三件事：
//
//  1. 启动时把 `findz_api_info` 语义的那一个信封写成第一行（握手）。ABI 版本与能力集
//     都在信封里，节点侧据此判定"版本不认识"而不是静默降级。
//  2. 之后每一行 stdin 是一个 `requestEnvelope`，原样交给 `findz_call` 的同一个入口
//     （`sharedFindzService.handle`），把返回的 `responseEnvelope` 写成一行 stdout。
//  3. 不解析、不缓存、不改写任何载荷 —— 帧的词表就是内核自己的词表，不新增第三套。
//
// 为什么不是 FFI（koffi / bun:ffi）：见 `docs/adr/0004-non-js-core-delivery.md`。
// 决定性的那条是故障半径：节点跑在 DSH 宿主进程内，而 `-buildmode=c-shared` 的 Go
// 库一旦 panic，在 cgo 边界是**不可恢复**的，陪葬的是使用者的宿主与整条会话。
//
// stdout 只承载帧：内核里没有任何一处写 stdout 或打日志（`grep` 过，见批次 D 的证据），
// 本文件也把诊断只写 stderr。

package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"os"
)

// 一行请求的上界。这个数字不是新发明的：`xiranite-target-node-manifest.json` 给 findz
// 的 `maxLiveBytes` 就是 67108864（64 MiB），理由写在那一行的 evidence 里 —— 它是这棵树
// 上唯一一个"重文本节点"声明的内存上限。取同一个数是为了让"宿主读得下"与"realm 放得下"
// 是同一条线；**它够不够没有测过**，同 manifest 的措辞一样，测它要一次真运行。
const maximumRequestFrameBytes = 64 * 1024 * 1024

func main() {
	out := bufio.NewWriter(os.Stdout)
	defer func() { _ = out.Flush() }()

	// 握手：与 `findz_api_info` 同一个信封（同一个 `currentAPIInfo()`）。
	if err := writeFrame(out, success("", currentAPIInfo())); err != nil {
		diagnose(err)
		return
	}

	in := bufio.NewScanner(os.Stdin)
	in.Buffer(make([]byte, 0, 64*1024), maximumRequestFrameBytes)
	for in.Scan() {
		line := bytes.TrimSpace(in.Bytes())
		if len(line) == 0 {
			continue
		}
		if err := writeFrame(out, sharedFindzService.handle(line)); err != nil {
			diagnose(err)
			return
		}
	}
	if err := in.Err(); err != nil {
		diagnose(err)
	}
}

// writeFrame 写一行信封并立刻冲刷。编码用 `json.Marshal`，与 FFI 路径的
// `marshalNativeResponse` 是同一个函数，所以两种交付形态的信封逐字节同形。
func writeFrame(out *bufio.Writer, envelope responseEnvelope) error {
	payload, err := json.Marshal(envelope)
	if err != nil {
		return err
	}
	if _, err := out.Write(payload); err != nil {
		return err
	}
	if err := out.WriteByte('\n'); err != nil {
		return err
	}
	return out.Flush()
}

func diagnose(err error) {
	fmt.Fprintf(os.Stderr, "findz-host: %v\n", err)
	os.Exit(1)
}
