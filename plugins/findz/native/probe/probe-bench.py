#!/usr/bin/env python3
"""findz-host 基准：ADR-0004「后果」第 2 条要求的那次耗时对比。

口径对齐上游 `docs/findz-v2-benchmarks.md`：同一个语料形状（24 个归档，每个 32 个
PNG 成员，每个 PNG 带 128 KiB 尾部填充），同样的阶段名（冷索引 / 热未变 / 头解析）。
绝对数字不可比（宿主是 macOS arm64，上游报告是 Windows x64），可比的是口径：
语料、阶段划分、以及"进程启动 + 序列化"这一层是本次新增的、上游 FFI 形态没有的开销。

用法：python3 probe-bench.py <findz-host> <临时工作目录> [归档数] [每档成员数]
"""

import json
import statistics
import struct
import subprocess
import sys
import time
import zipfile
import zlib
from pathlib import Path

HOST = Path(sys.argv[1]).resolve()
WORK = Path(sys.argv[2]).resolve()
ARCHIVES = int(sys.argv[3]) if len(sys.argv) > 3 else 24
MEMBERS = int(sys.argv[4]) if len(sys.argv) > 4 else 32
PADDING = 128 * 1024


def png_bytes(width: int, height: int, padding: int) -> bytes:
    def chunk(kind: bytes, payload: bytes) -> bytes:
        return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    raw = b"".join(b"\x00" + bytes([0, 128, 255]) * width for _ in range(height))
    body = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")
    return body + b"\x00" * padding


def build_corpus() -> Path:
    root = WORK / "corpus"
    root.mkdir(parents=True, exist_ok=True)
    for index in range(ARCHIVES):
        path = root / f"library-{index:02d}.cbz"
        if path.exists():
            continue
        with zipfile.ZipFile(path, "w", zipfile.ZIP_STORED) as z:
            for member in range(MEMBERS):
                z.writestr(f"pages/{member:03d}.png", png_bytes(160, 120, PADDING))
    return root


class Host:
    def __init__(self) -> None:
        self.proc = subprocess.Popen(
            [str(HOST)], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, text=True, bufsize=1,
        )
        self.seq = 0
        self.greeting = json.loads(self.proc.stdout.readline())

    def call(self, method: str, params: dict = None):
        self.seq += 1
        self.proc.stdin.write(json.dumps({
            "requestVersion": 1, "requestId": f"bench-{self.seq}", "method": method, "params": params or {},
        }) + "\n")
        self.proc.stdin.flush()
        return json.loads(self.proc.stdout.readline())

    def call_timed(self, method: str, params: dict = None) -> float:
        started = time.perf_counter()
        response = self.call(method, params)
        elapsed = (time.perf_counter() - started) * 1000
        if not response.get("ok"):
            raise RuntimeError(f"{method} failed: {response.get('error')}")
        return elapsed

    def wait_task(self, library_id: str, task_id: str) -> tuple[float, dict]:
        started = time.perf_counter()
        while True:
            r = self.call("task.get", {"libraryId": library_id, "taskId": task_id})
            result = r.get("result") or {}
            if result.get("status") in ("completed", "completed_with_warnings", "failed", "cancelled"):
                return (time.perf_counter() - started) * 1000, result
            time.sleep(0.005)

    def start_task(self, method: str, params: dict) -> str:
        r = self.call(method, params)
        if not r.get("ok"):
            raise RuntimeError(f"{method} failed: {r.get('error')}")
        return (r.get("result") or {}).get("id")

    def close(self) -> None:
        self.proc.stdin.close()
        self.proc.wait(timeout=30)


def main() -> int:
    root = build_corpus()
    library_id = "bench-library"
    database_path = WORK / "index" / f"{library_id}.sqlite"
    report: dict[str, object] = {
        "host": str(HOST), "archives": ARCHIVES, "membersPerArchive": MEMBERS,
        "paddingBytes": PADDING, "libraryBytes": sum(p.stat().st_size for p in root.glob("*.cbz")),
    }

    spawn_started = time.perf_counter()
    host = Host()
    report["hostSpawnToGreetingMs"] = round((time.perf_counter() - spawn_started) * 1000, 3)
    report["abiVersion"] = (host.greeting.get("result") or {}).get("abiVersion")

    report["libraryOpenMs"] = round(host.call_timed("library.open", {
        "libraryId": library_id, "root": str(root), "databasePath": str(database_path),
    }), 3)

    started = time.perf_counter()
    task_id = host.start_task("scan.start", {"libraryId": library_id})
    waited, task = host.wait_task(library_id, task_id)
    report["scanColdMs"] = round((time.perf_counter() - started) * 1000, 3)
    report["scanColdDoneArchives"] = task.get("doneArchives")

    task_id = host.start_task("scan.reconcile", {"libraryId": library_id})
    started = time.perf_counter()
    waited, task = host.wait_task(library_id, task_id)
    report["scanWarmUnchangedMs"] = round((time.perf_counter() - started) * 1000, 3)

    query_samples = [host.call_timed("query.archives", {"libraryId": library_id, "text": ""}) for _ in range(10)]
    report["queryRoundTripMsMedian"] = round(statistics.median(query_samples), 3)
    report["queryRoundTripMsMin"] = round(min(query_samples), 3)

    started = time.perf_counter()
    task_id = host.start_task("analysis.start", {"libraryId": library_id, "scope": {"kind": "all"}})
    waited, task = host.wait_task(library_id, task_id)
    report["analysisMs"] = round((time.perf_counter() - started) * 1000, 3)
    report["analysisStatus"] = task.get("status")
    report["analysisDoneMembers"] = task.get("doneMembers")
    report["analysisFailedMembers"] = task.get("failedMembers")

    r = host.call("query.members", {"libraryId": library_id, "archiveId": ((host.call("query.archives", {"libraryId": library_id}) ["result"]) ["items"] [0]) ["id"]})
    items = (r.get("result") or {}).get("items") or []
    report["analyzedSample"] = [{"path": m.get("memberPath"), "format": m.get("actualFormat"), "w": m.get("width"), "h": m.get("height")} for m in items[:3]]

    report["plainQueryMsMedian"] = report["queryRoundTripMsMedian"]
    host.close()

    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
