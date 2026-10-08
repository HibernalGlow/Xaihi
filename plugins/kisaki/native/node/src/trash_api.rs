#[cfg(any(
    test,
    all(
        unix,
        not(target_os = "macos"),
        not(target_os = "ios"),
        not(target_os = "android")
    )
))]
use std::collections::HashSet;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::{Condvar, Mutex, OnceLock};
use std::time::{Duration, Instant};

use napi::bindgen_prelude::{AsyncTask, Error, Result, Task};
use napi::{Env, Status};
use napi_derive::napi;

const TRASH_ITEM_API_SUPPORTED: bool = cfg!(any(
    target_os = "windows",
    all(
        unix,
        not(target_os = "macos"),
        not(target_os = "ios"),
        not(target_os = "android")
    )
));
const TRASH_LIST_CACHE_TTL: Duration = Duration::from_secs(5);

#[derive(Default)]
struct TrashListCache {
    items: Vec<trash::TrashItem>,
    refreshed_at: Option<Instant>,
    refreshing: bool,
    pending_mutations: Vec<TrashListCacheMutation>,
}

enum TrashListCacheMutation {
    Upsert(trash::TrashItem),
    Remove(OsString),
}

#[napi(object)]
pub struct TrashCapabilities {
    pub delete_to_trash: bool,
    pub list: bool,
    pub restore: bool,
    pub provider: String,
    pub provider_version: String,
}

#[napi]
pub fn get_trash_capabilities() -> TrashCapabilities {
    TrashCapabilities {
        delete_to_trash: true,
        list: TRASH_ITEM_API_SUPPORTED,
        restore: TRASH_ITEM_API_SUPPORTED,
        provider: "trash-rs".into(),
        provider_version: "5.2.6".into(),
    }
}

#[napi(object)]
#[derive(Clone)]
pub struct TrashItemReceipt {
    pub id: String,
    pub name: String,
    pub original_parent: String,
    pub time_deleted: f64,
}

#[napi(object)]
pub struct TrashPathResult {
    pub trashed: bool,
    pub receipt: Option<TrashItemReceipt>,
}

pub struct TrashPathOutput {
    receipt: Option<trash::TrashItem>,
}

pub struct TrashPathTask {
    path: PathBuf,
}

#[napi]
pub fn trash_path(path: String) -> Result<AsyncTask<TrashPathTask>> {
    if path.trim().is_empty() {
        return Err(Error::new(Status::InvalidArg, "path cannot be empty"));
    }
    Ok(AsyncTask::new(TrashPathTask {
        path: PathBuf::from(path),
    }))
}

impl Task for TrashPathTask {
    type Output = TrashPathOutput;
    type JsValue = TrashPathResult;

    fn compute(&mut self) -> Result<Self::Output> {
        let path = canonical_target(&self.path)?;
        let receipt = delete_to_trash_with_receipt(&path)?;
        Ok(TrashPathOutput { receipt })
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(TrashPathResult {
            trashed: true,
            receipt: output.receipt.map(to_trash_item_receipt),
        })
    }
}

pub struct ListTrashItemsTask;

#[napi]
pub fn list_trash_items() -> Result<AsyncTask<ListTrashItemsTask>> {
    require_trash_item_api()?;
    Ok(AsyncTask::new(ListTrashItemsTask))
}

impl Task for ListTrashItemsTask {
    type Output = Vec<trash::TrashItem>;
    type JsValue = Vec<TrashItemReceipt>;

    fn compute(&mut self) -> Result<Self::Output> {
        list_trash_items_native()
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output.into_iter().map(to_trash_item_receipt).collect())
    }
}

pub struct RestoreTrashItemTask {
    receipt: TrashItemReceipt,
}

#[napi]
pub fn restore_trash_item(receipt: TrashItemReceipt) -> Result<AsyncTask<RestoreTrashItemTask>> {
    require_trash_item_api()?;
    if receipt.id.is_empty() || receipt.name.is_empty() || receipt.original_parent.is_empty() {
        return Err(Error::new(
            Status::InvalidArg,
            "trash receipt is incomplete",
        ));
    }
    Ok(AsyncTask::new(RestoreTrashItemTask { receipt }))
}

impl Task for RestoreTrashItemTask {
    type Output = ();
    type JsValue = ();

    fn compute(&mut self) -> Result<Self::Output> {
        restore_trash_item_native(to_native_trash_item(&self.receipt))
    }

    fn resolve(&mut self, _env: Env, _output: Self::Output) -> Result<Self::JsValue> {
        Ok(())
    }
}

fn canonical_target(path: &Path) -> Result<PathBuf> {
    let parent = path.parent().ok_or_else(|| {
        Error::new(
            Status::InvalidArg,
            "trash target cannot be a filesystem root",
        )
    })?;
    let canonical_parent = parent.canonicalize().map_err(|error| {
        Error::from_reason(format!(
            "Failed to resolve trash target parent {}: {error}",
            parent.display()
        ))
    })?;
    Ok(path
        .file_name()
        .map_or(canonical_parent.clone(), |name| canonical_parent.join(name)))
}

fn to_trash_item_receipt(item: trash::TrashItem) -> TrashItemReceipt {
    TrashItemReceipt {
        id: item.id.to_string_lossy().into_owned(),
        name: item.name.to_string_lossy().into_owned(),
        original_parent: item.original_parent.to_string_lossy().into_owned(),
        time_deleted: item.time_deleted as f64,
    }
}

fn to_native_trash_item(receipt: &TrashItemReceipt) -> trash::TrashItem {
    trash::TrashItem {
        id: OsString::from(&receipt.id),
        name: OsString::from(&receipt.name),
        original_parent: PathBuf::from(&receipt.original_parent),
        time_deleted: receipt.time_deleted as i64,
    }
}

fn require_trash_item_api() -> Result<()> {
    if TRASH_ITEM_API_SUPPORTED {
        Ok(())
    } else {
        Err(Error::new(
            Status::GenericFailure,
            "trash item listing and restore are unavailable on this platform",
        ))
    }
}

#[cfg(any(
    target_os = "windows",
    all(
        unix,
        not(target_os = "macos"),
        not(target_os = "ios"),
        not(target_os = "android")
    )
))]
fn list_trash_items_native() -> Result<Vec<trash::TrashItem>> {
    list_trash_items_cached(trash_list_cache(), scan_trash_items_native)
}

fn list_trash_items_cached(
    (cache, refreshed): &(Mutex<TrashListCache>, Condvar),
    scan: impl FnOnce() -> Result<Vec<trash::TrashItem>>,
) -> Result<Vec<trash::TrashItem>> {
    let mut state = cache.lock().expect("trash list cache mutex poisoned");
    loop {
        if state
            .refreshed_at
            .is_some_and(|updated| updated.elapsed() < TRASH_LIST_CACHE_TTL)
        {
            return Ok(state.items.clone());
        }
        if !state.refreshing {
            state.refreshing = true;
            break;
        }
        state = refreshed
            .wait(state)
            .expect("trash list cache mutex poisoned while waiting");
    }
    drop(state);

    let scanned = scan();
    let mut state = cache.lock().expect("trash list cache mutex poisoned");
    state.refreshing = false;
    let result = match scanned {
        Ok(mut items) => {
            for mutation in state.pending_mutations.drain(..) {
                apply_trash_list_cache_mutation(&mut items, mutation);
            }
            state.items = items;
            state.refreshed_at = Some(Instant::now());
            Ok(state.items.clone())
        }
        Err(error) => {
            state.pending_mutations.clear();
            Err(error)
        }
    };
    refreshed.notify_all();
    result
}

#[cfg(not(any(
    target_os = "windows",
    all(
        unix,
        not(target_os = "macos"),
        not(target_os = "ios"),
        not(target_os = "android")
    )
)))]
fn list_trash_items_native() -> Result<Vec<trash::TrashItem>> {
    require_trash_item_api()?;
    unreachable!()
}

#[cfg(any(
    target_os = "windows",
    all(
        unix,
        not(target_os = "macos"),
        not(target_os = "ios"),
        not(target_os = "android")
    )
))]
fn restore_trash_item_native(item: trash::TrashItem) -> Result<()> {
    let id = item.id.clone();
    trash::os_limited::restore_all([item]).map_err(trash_error)?;
    remove_cached_trash_item(&id);
    Ok(())
}

#[cfg(target_os = "windows")]
fn scan_trash_items_native() -> Result<Vec<trash::TrashItem>> {
    crate::windows_trash::list_trash_items().map_err(|error| {
        Error::from_reason(format!("Failed to enumerate the recycle bin: {error}"))
    })
}

#[cfg(all(
    unix,
    not(target_os = "macos"),
    not(target_os = "ios"),
    not(target_os = "android")
))]
fn scan_trash_items_native() -> Result<Vec<trash::TrashItem>> {
    trash::os_limited::list().map_err(trash_error)
}

#[cfg(not(any(
    target_os = "windows",
    all(
        unix,
        not(target_os = "macos"),
        not(target_os = "ios"),
        not(target_os = "android")
    )
)))]
fn restore_trash_item_native(_item: trash::TrashItem) -> Result<()> {
    require_trash_item_api()
}

#[cfg(target_os = "windows")]
fn delete_to_trash_with_receipt(path: &Path) -> Result<Option<trash::TrashItem>> {
    let receipt = crate::windows_trash::delete_to_trash_with_receipt(path)
        .map_err(|error| Error::from_reason(error.to_string()))?;
    if let Some(item) = &receipt {
        upsert_cached_trash_item(item);
    }
    Ok(receipt)
}

#[cfg(all(
    unix,
    not(target_os = "macos"),
    not(target_os = "ios"),
    not(target_os = "android")
))]
fn delete_to_trash_with_receipt(path: &Path) -> Result<Option<trash::TrashItem>> {
    let before = list_matching_trash_item_ids(path)?;
    trash::delete(path).map_err(trash_error)?;
    let receipt = find_new_trash_item(path, &before)?;
    if let Some(item) = &receipt {
        upsert_cached_trash_item(item);
    }
    Ok(receipt)
}

#[cfg(not(any(
    target_os = "windows",
    all(
        unix,
        not(target_os = "macos"),
        not(target_os = "ios"),
        not(target_os = "android")
    )
)))]
fn delete_to_trash_with_receipt(path: &Path) -> Result<Option<trash::TrashItem>> {
    trash::delete(path).map_err(trash_error)?;
    Ok(None)
}

#[cfg(all(
    unix,
    not(target_os = "macos"),
    not(target_os = "ios"),
    not(target_os = "android")
))]
fn list_matching_trash_item_ids(path: &Path) -> Result<HashSet<OsString>> {
    Ok(trash::os_limited::list()
        .map_err(trash_error)?
        .into_iter()
        .filter(|item| item.original_path() == path)
        .map(|item| item.id)
        .collect())
}

#[cfg(all(
    unix,
    not(target_os = "macos"),
    not(target_os = "ios"),
    not(target_os = "android")
))]
fn find_new_trash_item(
    path: &Path,
    before: &HashSet<OsString>,
) -> Result<Option<trash::TrashItem>> {
    let items = trash::os_limited::list().map_err(trash_error)?;
    Ok(select_new_trash_item(path, before, items))
}

#[cfg(any(
    test,
    all(
        unix,
        not(target_os = "macos"),
        not(target_os = "ios"),
        not(target_os = "android")
    )
))]
fn select_new_trash_item(
    path: &Path,
    before: &HashSet<OsString>,
    items: Vec<trash::TrashItem>,
) -> Option<trash::TrashItem> {
    items
        .into_iter()
        .filter(|item| item.original_path() == path && !before.contains(&item.id))
        .max_by(|left, right| {
            left.time_deleted
                .cmp(&right.time_deleted)
                .then_with(|| left.id.cmp(&right.id))
        })
}

fn trash_error(error: trash::Error) -> Error {
    Error::from_reason(error.to_string())
}

fn trash_list_cache() -> &'static (Mutex<TrashListCache>, Condvar) {
    static CACHE: OnceLock<(Mutex<TrashListCache>, Condvar)> = OnceLock::new();
    CACHE.get_or_init(|| (Mutex::new(TrashListCache::default()), Condvar::new()))
}

fn upsert_cached_trash_item(item: &trash::TrashItem) {
    let (cache, _) = trash_list_cache();
    let mut state = cache.lock().expect("trash list cache mutex poisoned");
    upsert_trash_list_cache(&mut state, item);
}

fn upsert_trash_list_cache(state: &mut TrashListCache, item: &trash::TrashItem) {
    if state.refreshed_at.is_some() {
        apply_trash_list_cache_mutation(
            &mut state.items,
            TrashListCacheMutation::Upsert(item.clone()),
        );
    }
    if state.refreshing {
        state
            .pending_mutations
            .push(TrashListCacheMutation::Upsert(item.clone()));
    }
}

fn remove_cached_trash_item(id: &OsString) {
    let (cache, _) = trash_list_cache();
    let mut state = cache.lock().expect("trash list cache mutex poisoned");
    remove_trash_list_cache_item(&mut state, id);
}

fn remove_trash_list_cache_item(state: &mut TrashListCache, id: &OsString) {
    if state.refreshed_at.is_some() {
        apply_trash_list_cache_mutation(
            &mut state.items,
            TrashListCacheMutation::Remove(id.clone()),
        );
    }
    if state.refreshing {
        state
            .pending_mutations
            .push(TrashListCacheMutation::Remove(id.clone()));
    }
}

fn apply_trash_list_cache_mutation(
    items: &mut Vec<trash::TrashItem>,
    mutation: TrashListCacheMutation,
) {
    match mutation {
        TrashListCacheMutation::Upsert(item) => {
            items.retain(|candidate| !trash_item_ids_equal(&candidate.id, &item.id));
            items.insert(0, item);
        }
        TrashListCacheMutation::Remove(id) => {
            items.retain(|candidate| !trash_item_ids_equal(&candidate.id, &id));
        }
    }
}

#[cfg(target_os = "windows")]
fn trash_item_ids_equal(left: &OsString, right: &OsString) -> bool {
    left.as_os_str().eq_ignore_ascii_case(right.as_os_str())
}

#[cfg(not(target_os = "windows"))]
fn trash_item_ids_equal(left: &OsString, right: &OsString) -> bool {
    left == right
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Arc, mpsc};
    use std::thread;

    #[test]
    fn coalesces_concurrent_cache_refreshes() {
        let cache = Arc::new((Mutex::new(TrashListCache::default()), Condvar::new()));
        let scan_count = Arc::new(AtomicUsize::new(0));
        let (leader_started_tx, leader_started_rx) = mpsc::channel();
        let (release_leader_tx, release_leader_rx) = mpsc::channel();

        let leader_cache = Arc::clone(&cache);
        let leader_scan_count = Arc::clone(&scan_count);
        let leader = thread::spawn(move || {
            list_trash_items_cached(&leader_cache, || {
                leader_scan_count.fetch_add(1, Ordering::SeqCst);
                leader_started_tx.send(()).unwrap();
                release_leader_rx.recv().unwrap();
                Ok(vec![
                    trash_item("shared", Path::new("D:/archive/shared.txt"), 10),
                    trash_item("restored", Path::new("D:/archive/restored.txt"), 9),
                ])
            })
            .unwrap()
        });
        leader_started_rx
            .recv_timeout(Duration::from_secs(1))
            .unwrap();

        let follower_cache = Arc::clone(&cache);
        let follower_scan_count = Arc::clone(&scan_count);
        let (follower_started_tx, follower_started_rx) = mpsc::channel();
        let (follower_scanned_tx, follower_scanned_rx) = mpsc::channel();
        let follower = thread::spawn(move || {
            follower_started_tx.send(()).unwrap();
            list_trash_items_cached(&follower_cache, || {
                follower_scan_count.fetch_add(1, Ordering::SeqCst);
                follower_scanned_tx.send(()).unwrap();
                Ok(vec![trash_item(
                    "duplicate-scan",
                    Path::new("D:/archive/duplicate.txt"),
                    11,
                )])
            })
            .unwrap()
        });
        follower_started_rx
            .recv_timeout(Duration::from_secs(1))
            .unwrap();
        assert!(matches!(
            follower_scanned_rx.recv_timeout(Duration::from_millis(50)),
            Err(mpsc::RecvTimeoutError::Timeout)
        ));
        {
            let mut state = cache.0.lock().unwrap();
            upsert_trash_list_cache(
                &mut state,
                &trash_item("direct", Path::new("D:/archive/direct.txt"), 11),
            );
            remove_trash_list_cache_item(&mut state, &OsString::from("restored"));
        }

        release_leader_tx.send(()).unwrap();
        let leader_items = leader.join().unwrap();
        let follower_items = follower.join().unwrap();

        assert_eq!(scan_count.load(Ordering::SeqCst), 1);
        let expected_ids = vec![OsString::from("direct"), OsString::from("shared")];
        assert_eq!(
            leader_items
                .iter()
                .map(|item| item.id.clone())
                .collect::<Vec<_>>(),
            expected_ids
        );
        assert_eq!(follower_items, leader_items);
    }

    #[test]
    fn direct_mutations_keep_warm_cache_consistent() {
        let retained = trash_item("retained", Path::new("D:/archive/retained.txt"), 10);
        let old_receipt = trash_item("receipt", Path::new("D:/archive/old.txt"), 20);
        let new_receipt = trash_item("receipt", Path::new("D:/archive/new.txt"), 30);
        let mut state = TrashListCache {
            items: vec![retained, old_receipt],
            refreshed_at: Some(Instant::now()),
            refreshing: false,
            pending_mutations: Vec::new(),
        };

        upsert_trash_list_cache(&mut state, &new_receipt);

        assert_eq!(
            state
                .items
                .iter()
                .map(|item| item.id.clone())
                .collect::<Vec<_>>(),
            vec![OsString::from("receipt"), OsString::from("retained")]
        );
        assert_eq!(
            state.items[0].original_path(),
            PathBuf::from("D:/archive/new.txt")
        );

        remove_trash_list_cache_item(&mut state, &OsString::from("receipt"));

        assert_eq!(state.items.len(), 1);
        assert_eq!(state.items[0].id, OsString::from("retained"));
    }

    #[test]
    fn failed_refresh_clears_scan_state_and_allows_retry() {
        let cache = (Mutex::new(TrashListCache::default()), Condvar::new());

        let failed = list_trash_items_cached(&cache, || {
            let mut state = cache.0.lock().unwrap();
            upsert_trash_list_cache(
                &mut state,
                &trash_item("direct", Path::new("D:/archive/direct.txt"), 11),
            );
            Err(Error::from_reason("scan failed"))
        });

        assert!(failed.is_err());
        {
            let state = cache.0.lock().unwrap();
            assert!(!state.refreshing);
            assert!(state.pending_mutations.is_empty());
            assert!(state.refreshed_at.is_none());
        }

        let retried = list_trash_items_cached(&cache, || {
            Ok(vec![trash_item(
                "direct",
                Path::new("D:/archive/direct.txt"),
                11,
            )])
        })
        .unwrap();

        assert_eq!(retried.len(), 1);
        assert_eq!(retried[0].id, OsString::from("direct"));
    }

    #[test]
    fn selects_latest_new_receipt_for_original_path() {
        let path = Path::new(r"D:\\archive\\test.txt");
        let existing_id = OsString::from("existing");
        let before = HashSet::from([existing_id.clone()]);
        let items = vec![
            trash_item(&existing_id.to_string_lossy(), path, 30),
            trash_item("other-path", Path::new(r"D:\\other\\test.txt"), 40),
            trash_item("older-new", path, 10),
            trash_item("latest-new", path, 20),
        ];

        let selected = select_new_trash_item(path, &before, items).unwrap();

        assert_eq!(selected.id, OsString::from("latest-new"));
    }

    fn trash_item(id: &str, original_path: &Path, time_deleted: i64) -> trash::TrashItem {
        trash::TrashItem {
            id: OsString::from(id),
            name: original_path.file_name().unwrap().to_owned(),
            original_parent: original_path.parent().unwrap().to_owned(),
            time_deleted,
        }
    }
}
