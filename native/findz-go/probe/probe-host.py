#!/usr/bin/env python3
"""findz-host 实机探针：验证 ADR-0004 决定 2 的进程外帧协议走真活。

不是单测的替代品，而是"这份内核在 Xaihi 的交付形态下真的能答话"的一次性读回。
用法：python3 probe-host.py <findz-host 可执行路径> <临时工作目录>
"""

import json
import os
import struct
import subprocess
import sys
import time
import zipfile
import zlib
from pathlib import Path

HOST = Path(sys.argv[1]).resolve()
WORK = Path(sys.argv[2]).resolve()


def png_bytes(width: int, height: int) -> bytes:
    """最小的真 PNG：IHDR + 一行 IDAT + IEND。头解析要的就是 IHDR 里的宽高。"""
    def chunk(kind: bytes, payload: bytes) -> bytes:
        return (
            struct.pack(">I", len(payload))
            + kind
            + payload
            + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    raw = b"".join(b"\x00" + bytes([255, 0, 0]) * width for _ in range(height))
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


def build_fixtures() -> None:
    root = WORK / "library"
    root.mkdir(parents=True, exist_ok=True)
    (root / "notes.txt").write_text("not an archive\n", encoding="utf-8")
    with zipfile.ZipFile(root / "alpha.cbz", "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("cover.png", png_bytes(120, 80))
        z.writestr("page/001.png", png_bytes(64, 64))
    with zipfile.ZipFile(root / "beta.zip", "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("wide.png", png_bytes(300, 40))


class Host:
    def __init__(self) -> None:
        self.proc = subprocess.Popen(
            [str(HOST)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        self.seq = 0
        self.greeting = self.read()

    def read(self) -> dict:
        line = self.proc.stdout.readline()
        if line == "":
            raise RuntimeError(f"host closed stdout; stderr={self.proc.stderr.read()}")
        return json.loads(line)

    def call(self, method: str, params: dict = None, *, version: int = 1, request_id: str = None):
        self.seq += 1
        envelope = {
            "requestVersion": version,
            "requestId": request_id if request_id is not None else f"probe-{self.seq}",
            "method": method,
            "params": params or {},
        }
        self.proc.stdin.write(json.dumps(envelope) + "\n")
        self.proc.stdin.flush()
        return self.read()

    def close(self) -> None:
        try:
            self.proc.stdin.close()
        except Exception:
            pass
        try:
            self.proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self.proc.kill()


def main() -> int:
    checks: list[tuple[str, bool, object]] = []

    def check(name: str, ok: bool, detail=None) -> None:
        checks.append((name, ok, detail))
        print(f"{'PASS' if ok else 'FAIL'}  {name}: {json.dumps(detail, ensure_ascii=False)[:400] if detail is not None else ''}")

    build_fixtures()
    library_id = "probe-library"
    database_path = WORK / "index" / f"{library_id}.sqlite"

    host = Host()
    greeting = host.greeting
    api = greeting.get("result") or {}
    check("握手是一行 ok 信封", greeting.get("ok") is True, {"ok": greeting.get("ok")})
    check("ABI 版本 = 1", api.get("abiVersion") == 1, {"abiVersion": api.get("abiVersion")})
    check("requestVersions 含 1", 1 in (api.get("requestVersions") or []), api.get("requestVersions"))
    required = [
        "library.open", "library.close", "scan.start", "scan.reconcile",
        "watcher.apply_changes", "watcher.set_health", "query.archives", "query.members",
        "export.rows", "projection.treemap", "analysis.start",
        "task.get", "task.pause", "task.resume", "task.cancel",
    ]
    caps = set(api.get("capabilities") or [])
    missing = [c for c in required if c not in caps]
    check("能力集覆盖必需项", not missing, {"missing": missing, "core": api.get("coreVersion")})

    r = host.call("findz_unknown_method")
    check("未知方法给结构化错误", r.get("ok") is False and (r.get("error") or {}).get("code") == "unsupported_method", (r.get("error") or {}).get("code"))

    r = host.call("api.info", version=99)
    check("不认识的 requestVersion 被拒", r.get("ok") is False and (r.get("error") or {}).get("code") == "unsupported_request_version", (r.get("error") or {}).get("code"))

    r = host.call("library.open", {
        "libraryId": library_id,
        "root": str(WORK / "library"),
        "databasePath": str(database_path),
    })
    check("library.open 成功", r.get("ok") is True, r.get("result") or r.get("error"))
    check("索引库真的落盘（不是空串路径）", database_path.exists(), {"databasePath": str(database_path), "bytes": database_path.stat().st_size if database_path.exists() else 0})

    r = host.call("scan.start", {"libraryId": library_id})
    task = r.get("result") or {}
    check("scan.start 回一条任务", r.get("ok") is True and bool(task.get("id")), {"taskId": task.get("id"), "kind": task.get("kind"), "status": task.get("status")})

    task_id = task.get("id")
    status = task.get("status")
    for _ in range(200):
        if status in ("completed", "completed_with_warnings", "failed", "cancelled"):
            break
        time.sleep(0.05)
        r = host.call("task.get", {"libraryId": library_id, "taskId": task_id})
        status = (r.get("result") or {}).get("status")
    done = r.get("result") or {}
    check("扫描收敛到完成", status in ("completed", "completed_with_warnings"), {"status": status, "totalArchives": done.get("totalArchives"), "doneArchives": done.get("doneArchives"), "totalMembers": done.get("totalMembers")})

    r = host.call("query.archives", {"libraryId": library_id, "text": ""})
    page = r.get("result") or {}
    rows = page.get("items") or []
    check("查询到两个归档、txt 未入索引", page.get("total") == 2 and sorted(x.get("relativePath") for x in rows) == ["alpha.cbz", "beta.zip"], {"total": page.get("total"), "paths": sorted(x.get("relativePath") for x in rows)})
    by_path = {x["relativePath"]: x for x in rows}
    alpha_id = by_path["alpha.cbz"]["id"]

    members = host.call("query.members", {"libraryId": library_id, "archiveId": alpha_id})
    mpage = members.get("result") or {}
    check("成员列出中央目录项", (mpage.get("total") or 0) == 2, {"total": mpage.get("total"), "members": [m.get("memberPath") for m in (mpage.get("items") or [])]})

    r = host.call("analysis.start", {"libraryId": library_id, "scope": {"kind": "all"}})
    atask = r.get("result") or {}
    astatus = atask.get("status")
    for _ in range(400):
        if astatus in ("completed", "completed_with_warnings", "failed", "cancelled"):
            break
        time.sleep(0.05)
        r = host.call("task.get", {"libraryId": library_id, "taskId": atask.get("id")})
        astatus = (r.get("result") or {}).get("status")
    check("图像分析任务收敛", astatus in ("completed", "completed_with_warnings"), {"status": astatus, "doneMembers": (r.get("result") or {}).get("doneMembers"), "failedMembers": (r.get("result") or {}).get("failedMembers")})

    r = host.call("query.members", {"libraryId": library_id, "archiveId": alpha_id})
    analyzed = [m for m in ((r.get("result") or {}).get("items") or []) if m.get("width")]
    check("真读出了 PNG 头里的宽高", len(analyzed) == 2 and all(m.get("actualFormat") == "png" and m.get("width") for m in analyzed), [{"path": m.get("memberPath"), "format": m.get("actualFormat"), "w": m.get("width"), "h": m.get("height"), "status": m.get("metadataStatus")} for m in analyzed])

    r = host.call("projection.treemap", {"libraryId": library_id, "areaBy": "archiveSize"})
    tree = r.get("result") or {}
    check("矩形图投影有根节点", r.get("ok") is True and bool(tree.get("name")), {"name": tree.get("name"), "children": len(tree.get("children") or [])})

    r = host.call("library.close", {"libraryId": library_id})
    check("library.close 成功", r.get("ok") is True, r.get("result") or r.get("error"))

    r = host.call("api.info", version=1, request_id="x" * 300)
    check("超长 requestId 被拒（闸门在，不是静默截断）", r.get("ok") is False and (r.get("error") or {}).get("code") == "invalid_request", {"code": (r.get("error") or {}).get("code"), "message": (r.get("error") or {}).get("message")})

    host.close()
    failed = [c for c in checks if not c[1]]
    print(f"\nCHECKS={len(checks)} FAILED={len(failed)}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
