//! `xaihi-trash-host` —— 回收站能力的**唯一原语执行者**（ADR-0025）。
//!
//! 它只做四件事，全部经 stdin/stdout 的**一行一条 JSON 帧**：
//!
//! | 请求 | 回什么 |
//! |---|---|
//! | `{"id":N,"verb":"capabilities"}` | `{deleteToTrash, receipt, list, restore, provider, providerVersion}` |
//! | `{"id":N,"verb":"trash","path":"<绝对路径>"}` | `{trashed:true, receipt:{name, originalParent, timeDeleted, size, landedPath, trashId}}` |
//! | `{"id":N,"verb":"restore","receipt":{…}}` | `{restored:true, path:"<原路径>"}` |
//! | `{"id":N,"verb":"list"}` | `[{receipt…}, …]`（macOS 上如实报"这条能力不在"） |
//!
//! 三条边界，都不是随手写的：
//!
//! 1. **账本不在这里**。这个进程只回一张**收据**（原路径 / 回收站落点 / 时间 / 大小），
//!    批次与"哪一次运行删了哪些"由节点侧按 ADR-0013 的 storage domain 记账。字节在系统回收站里，
//!    我们**不复制**（ADR-0025 决定 4）。
//! 2. **macOS 的落点是问系统要的**，不是自己拼的：`trashItemAtURL` 的 `resultingItemURL`
//!    会把撞名改名与跨卷 `<卷>/.Trashes/<uid>` 一起算好。`trash` crate 自己把这个出参丢成了 `None`
//!    （`trash-5.2.6/src/macos/mod.rs:100`），所以这一层直接调 objc2。
//! 3. **能力按平台如实报**。`trash` crate 的 `os_limited`（list/restore）cfg 是
//!    `windows | unix(非 macos/ios/android)` —— macOS 上它不存在，这里就照实说 `list:false`，
//!    而不是回一个空列表让调用方以为"回收站是空的"（ADR-0011 决定 4）。

use std::io::{BufRead, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};

fn main() {
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout();
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let (id, outcome) = match serde_json::from_str::<Value>(trimmed) {
            Ok(request) => {
                let id = request.get("id").cloned().unwrap_or(Value::Null);
                (id, dispatch(&request))
            }
            Err(error) => (Value::Null, Err(format!("request is not JSON: {error}"))),
        };
        let frame = match outcome {
            Ok(result) => json!({ "id": id, "ok": true, "result": result }),
            Err(error) => json!({ "id": id, "ok": false, "error": error }),
        };
        let _ = writeln!(stdout, "{frame}");
        let _ = stdout.flush();
    }
}

fn dispatch(request: &Value) -> Result<Value, String> {
    let verb = request
        .get("verb")
        .and_then(Value::as_str)
        .ok_or_else(|| "request needs a string `verb`".to_string())?;
    match verb {
        "capabilities" => Ok(capabilities()),
        "trash" => {
            let path = request
                .get("path")
                .and_then(Value::as_str)
                .ok_or_else(|| "trash needs a string `path`".to_string())?;
            trash(path)
        }
        "restore" => {
            let receipt = request
                .get("receipt")
                .ok_or_else(|| "restore needs a `receipt` object".to_string())?;
            restore(receipt)
        }
        "list" => list(),
        other => Err(format!(
            "unknown verb {other:?}（认识的只有 capabilities / trash / restore / list）"
        )),
    }
}

/// `os_limited` 在哪些平台存在 —— 与 `trash` crate 自己的 cfg **逐字同款**，不另立一套判断。
const OS_LIMITED_SUPPORTED: bool = cfg!(any(
    target_os = "windows",
    all(unix, not(target_os = "macos"), not(target_os = "ios"), not(target_os = "android"))
));

fn capabilities() -> Value {
    json!({
        "deleteToTrash": true,
        // 收据总能给：macOS 是问系统要的落点，Win/Linux 由删除前后各列一次回收站做差得出。
        "receipt": true,
        "list": OS_LIMITED_SUPPORTED,
        // macOS 上"恢复"靠收据里的落点自己移回（只对**本进程给出的**收据成立）；
        // Win/Linux 交给 os_limited::restore_all。
        "restore": true,
        "provider": "trash-rs",
        "providerVersion": "5.2.6",
    })
}

/// 只接受"父目录存在 + 一个文件名"的形状：根目录、`.`、`..` 都不是能进回收站的东西。
fn absolute_target(path: &str) -> Result<PathBuf, String> {
    let given = PathBuf::from(path);
    let name = given
        .file_name()
        .ok_or_else(|| format!("trash target cannot be a filesystem root: {path}"))?;
    let parent = given
        .parent()
        .ok_or_else(|| format!("trash target cannot be a filesystem root: {path}"))?;
    let canonical_parent = parent
        .canonicalize()
        .map_err(|error| format!("cannot resolve trash target parent {}: {error}", parent.display()))?;
    Ok(canonical_parent.join(name))
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs() as i64)
        .unwrap_or(0)
}

fn trash(path: &str) -> Result<Value, String> {
    let absolute = absolute_target(path)?;
    let metadata = std::fs::symlink_metadata(&absolute)
        .map_err(|error| format!("cannot stat {}: {error}", absolute.display()))?;
    let name = absolute
        .file_name()
        .map(|value| value.to_string_lossy().into_owned())
        .ok_or_else(|| format!("trash target has no file name: {}", absolute.display()))?;
    let original_parent = absolute
        .parent()
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_default();
    let landed = move_to_trash(&absolute)?;
    Ok(json!({
        "trashed": true,
        "receipt": {
            "name": name,
            "originalParent": original_parent,
            "timeDeleted": now_secs(),
            "size": metadata.len(),
            "landedPath": landed,
        },
    }))
}

#[cfg(target_os = "macos")]
fn move_to_trash(absolute: &Path) -> Result<Value, String> {
    use objc2::rc::Retained;
    use objc2_foundation::{NSFileManager, NSString, NSURL};

    let text = NSString::from_str(&absolute.to_string_lossy());
    let url = NSURL::fileURLWithPath(&text);
    let mut out: Option<Retained<NSURL>> = None;
    NSFileManager::defaultManager()
        .trashItemAtURL_resultingItemURL_error(&url, Some(&mut out))
        .map_err(|error| format!("trashItemAtURL failed for {}: {error}", absolute.display()))?;
    Ok(out
        .and_then(|url| url.path())
        .map_or(Value::Null, |path| Value::String(path.to_string())))
}

#[cfg(not(target_os = "macos"))]
fn move_to_trash(absolute: &Path) -> Result<Value, String> {
    trash::delete(absolute)
        .map_err(|error| format!("trash::delete failed for {}: {error}", absolute.display()))?;
    // 删除前后各列一次，找出刚落进去的那一条 —— 与 `trash` crate 自己在 Linux 上选新条目的做法同一条。
    let landed = trash::os_limited::list()
        .ok()
        .and_then(|items| {
            items
                .into_iter()
                .filter(|item| item.original_path() == absolute)
                .max_by_key(|item| item.time_deleted)
        })
        .map(|item| Value::String(item.id.to_string_lossy().into_owned()));
    Ok(landed.unwrap_or(Value::Null))
}

fn restore(receipt: &Value) -> Result<Value, String> {
    let name = receipt
        .get("name")
        .and_then(Value::as_str)
        .ok_or_else(|| "receipt needs a string `name`".to_string())?;
    let original_parent = receipt
        .get("originalParent")
        .and_then(Value::as_str)
        .ok_or_else(|| "receipt needs a string `originalParent`".to_string())?;
    let original = Path::new(original_parent).join(name);
    if original.exists() {
        return Err(format!(
            "refusing to restore: {} already exists（先把它挪开，别让恢复覆盖掉现在的东西）",
            original.display()
        ));
    }
    restore_to(receipt, &original)?;
    Ok(json!({ "restored": true, "path": original.to_string_lossy() }))
}

#[cfg(target_os = "macos")]
fn restore_to(receipt: &Value, original: &Path) -> Result<(), String> {
    let landed = receipt
        .get("landedPath")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            "这一张收据没有落点（landedPath）：macOS 上只能恢复本进程给出的收据".to_string()
        })?;
    let landed = Path::new(landed);
    if !landed.exists() {
        return Err(format!(
            "回收站里已经没有 {} 了（可能被 Finder 放回过、或被清空）",
            landed.display()
        ));
    }
    std::fs::rename(landed, original).map_err(|error| {
        format!(
            "cannot move {} back to {}: {error}",
            landed.display(),
            original.display()
        )
    })
}

#[cfg(not(target_os = "macos"))]
fn restore_to(receipt: &Value, original: &Path) -> Result<(), String> {
    let wanted_id = receipt
        .get("landedPath")
        .and_then(Value::as_str)
        .ok_or_else(|| "这一张收据没有 id（landedPath 这一格在 Win/Linux 上是回收站条目的 id）".to_string())?;
    let items = trash::os_limited::list()
        .map_err(|error| format!("cannot list the trash: {error}"))?;
    let item = items
        .into_iter()
        .find(|item| item.id.to_string_lossy() == wanted_id)
        .ok_or_else(|| format!("回收站里已经没有条目 {wanted_id} 了"))?;
    trash::os_limited::restore_all([item])
        .map_err(|error| format!("restore_all failed for {}: {error}", original.display()))
}

fn list() -> Result<Value, String> {
    if !OS_LIMITED_SUPPORTED {
        return Err(
            "list 在这个平台上不可用：`trash` crate 的 os_limited 只有 Windows 与 Linux(freedesktop) 实现，\
             macOS 不在其中（ADR-0025 决定 3）。macOS 上要列「我们删过什么」请看节点侧的批次账本。"
                .to_string(),
        );
    }
    #[cfg(not(target_os = "macos"))]
    {
        let items = trash::os_limited::list()
            .map_err(|error| format!("cannot list the trash: {error}"))?;
        let receipts = items
            .into_iter()
            .map(|item| {
                json!({
                    "name": item.name.to_string_lossy(),
                    "originalParent": item.original_parent.to_string_lossy(),
                    "timeDeleted": item.time_deleted,
                    "size": Value::Null,
                    "landedPath": item.id.to_string_lossy(),
                })
            })
            .collect::<Vec<Value>>();
        Ok(Value::Array(receipts))
    }
    #[cfg(target_os = "macos")]
    {
        Err("unreachable: macOS 上 OS_LIMITED_SUPPORTED 恒为 false，上面那条已经返回".to_string())
    }
}
