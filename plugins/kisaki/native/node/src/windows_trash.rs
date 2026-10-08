use std::cmp::Reverse;
use std::ffi::{OsStr, OsString, c_void};
use std::fs::{self, File};
use std::io::{self, Read};
use std::os::windows::ffi::{OsStrExt, OsStringExt};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use rayon::prelude::*;
use trash_core::{RecycleBinIndex, parse_index, scan_pairs};
use windows::Win32::Foundation::E_ABORT;
use windows::Win32::Storage::FileSystem::{GetDriveTypeW, GetLogicalDrives};
use windows::Win32::System::Com::{
    CLSCTX_ALL, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx, CoTaskMemFree,
    CoUninitialize,
};
use windows::Win32::System::WindowsProgramming::{DRIVE_FIXED, DRIVE_REMOVABLE};
use windows::Win32::UI::Shell::{
    FOF_ALLOWUNDO, FOF_NO_UI, FOF_WANTNUKEWARNING, FileOperation, IFileOperation,
    IFileOperationProgressSink, IFileOperationProgressSink_Impl, IShellItem,
    SHCreateItemFromParsingName, SIGDN_DESKTOPABSOLUTEPARSING,
};
use windows::core::{HRESULT, PCWSTR, implement};

const MAX_RECYCLE_INDEX_BYTES: u64 = 28 + 2 * 32_768;

pub fn list_trash_items() -> io::Result<Vec<trash::TrashItem>> {
    let mut pairs = Vec::new();
    for drive_root in local_drive_roots()? {
        let recycle_bin = drive_root.join("$RECYCLE.BIN");
        let Ok(account_directories) = fs::read_dir(recycle_bin) else {
            continue;
        };
        for account_directory in account_directories.flatten() {
            if !account_directory
                .file_type()
                .is_ok_and(|file_type| file_type.is_dir())
            {
                continue;
            }
            let Ok(account_pairs) = scan_pairs(&account_directory.path()) else {
                continue;
            };
            pairs.extend(account_pairs);
        }
    }
    let mut items = pairs
        .into_par_iter()
        .filter_map(|pair| {
            let content_path = existing_content_path(&pair.index_path, pair.content_path)?;
            let bytes = read_recycle_index(&pair.index_path)?;
            let index = parse_index(&bytes).ok()?;
            trash_item_from_index(content_path, index)
        })
        .collect::<Vec<_>>();
    items.sort_unstable_by_key(|item| Reverse(item.time_deleted));
    Ok(items)
}

fn existing_content_path(index_path: &Path, content_path: Option<PathBuf>) -> Option<PathBuf> {
    if content_path.is_some() {
        return content_path;
    }

    let index_name = index_path.file_name()?.to_str()?;
    let suffix = index_name.strip_prefix("$I")?;
    let candidate = index_path.with_file_name(format!("$R{suffix}"));
    candidate.try_exists().ok()?.then_some(candidate)
}

fn local_drive_roots() -> io::Result<Vec<PathBuf>> {
    let drive_mask = unsafe { GetLogicalDrives() };
    if drive_mask == 0 {
        return Err(io::Error::last_os_error());
    }

    let mut roots = Vec::new();
    for drive_index in 0..26 {
        if drive_mask & (1 << drive_index) == 0 {
            continue;
        }
        let root = [
            b'A' as u16 + drive_index as u16,
            b':' as u16,
            b'\\' as u16,
            0,
        ];
        let drive_type = unsafe { GetDriveTypeW(PCWSTR(root.as_ptr())) };
        if drive_type == DRIVE_FIXED || drive_type == DRIVE_REMOVABLE {
            roots.push(PathBuf::from(OsString::from_wide(&root[..3])));
        }
    }
    Ok(roots)
}

fn read_recycle_index(path: &Path) -> Option<Vec<u8>> {
    let file = File::open(path).ok()?;
    let mut bytes = Vec::new();
    file.take(MAX_RECYCLE_INDEX_BYTES + 1)
        .read_to_end(&mut bytes)
        .ok()?;
    (bytes.len() as u64 <= MAX_RECYCLE_INDEX_BYTES).then_some(bytes)
}

fn trash_item_from_index(
    content_path: PathBuf,
    index: RecycleBinIndex,
) -> Option<trash::TrashItem> {
    let original_path = PathBuf::from(index.original_path);
    Some(trash::TrashItem {
        id: content_path.into_os_string(),
        name: original_path.file_name()?.to_owned(),
        original_parent: original_path.parent()?.to_owned(),
        time_deleted: index.deleted_at.map_or(0, |value| value.timestamp()),
    })
}

pub fn delete_to_trash_with_receipt(
    path: &Path,
) -> windows::core::Result<Option<trash::TrashItem>> {
    let _apartment =
        ComApartment::initialize().map_err(|error| context("CoInitializeEx", error))?;
    let source_item = shell_item_from_path(path)
        .map_err(|error| context("SHCreateItemFromParsingName", error))?;
    let sink = DeleteProgressSink::new(path);
    let receipt = sink.receipt.clone();
    let sink_interface: IFileOperationProgressSink = sink.into();

    unsafe {
        let operation: IFileOperation =
            CoCreateInstance(&FileOperation as *const _, None, CLSCTX_ALL)
                .map_err(|error| context("CoCreateInstance(FileOperation)", error))?;
        operation
            .SetOperationFlags(FOF_NO_UI | FOF_ALLOWUNDO | FOF_WANTNUKEWARNING)
            .map_err(|error| context("IFileOperation::SetOperationFlags", error))?;
        let cookie = operation
            .Advise(&sink_interface)
            .map_err(|error| context("IFileOperation::Advise", error))?;
        let queued = operation
            .DeleteItem(&source_item, None)
            .map_err(|error| context("IFileOperation::DeleteItem", error));
        let performed = queued.and_then(|()| {
            operation
                .PerformOperations()
                .map_err(|error| context("IFileOperation::PerformOperations", error))
        });
        let _ = operation.Unadvise(cookie);
        performed?;
        if operation
            .GetAnyOperationsAborted()
            .map_err(|error| context("IFileOperation::GetAnyOperationsAborted", error))?
            .as_bool()
        {
            return Err(windows::core::Error::from(E_ABORT));
        }
    }

    Ok(receipt
        .lock()
        .expect("delete progress receipt mutex poisoned")
        .clone())
}

fn context(stage: &str, error: windows::core::Error) -> windows::core::Error {
    windows::core::Error::new(error.code(), format!("{stage}: {error}"))
}

fn shell_item_from_path(path: &Path) -> windows::core::Result<IShellItem> {
    let path = strip_verbatim_prefix(path);
    let wide = to_wide(path.as_os_str());
    unsafe { SHCreateItemFromParsingName(PCWSTR(wide.as_ptr()), None) }
}

fn strip_verbatim_prefix(path: &Path) -> PathBuf {
    let value = path.as_os_str().to_string_lossy();
    if let Some(rest) = value.strip_prefix(r"\\?\UNC\") {
        PathBuf::from(format!(r"\\{rest}"))
    } else if let Some(rest) = value.strip_prefix(r"\\?\") {
        PathBuf::from(rest)
    } else {
        path.to_owned()
    }
}

fn to_wide(value: &OsStr) -> Vec<u16> {
    value.encode_wide().chain(std::iter::once(0)).collect()
}

fn recycle_item_id(item: &IShellItem) -> windows::core::Result<OsString> {
    let value = unsafe { item.GetDisplayName(SIGDN_DESKTOPABSOLUTEPARSING)? };
    let result = unsafe {
        let mut length = 0;
        while *value.0.add(length) != 0 {
            length += 1;
        }
        OsString::from_wide(std::slice::from_raw_parts(value.0, length))
    };
    unsafe { CoTaskMemFree(Some(value.0.cast::<c_void>())) };
    Ok(result)
}

#[implement(IFileOperationProgressSink)]
struct DeleteProgressSink {
    original_parent: PathBuf,
    name: OsString,
    receipt: Arc<Mutex<Option<trash::TrashItem>>>,
}

impl DeleteProgressSink {
    fn new(path: &Path) -> Self {
        Self {
            original_parent: strip_verbatim_prefix(path.parent().unwrap_or(path)),
            name: path.file_name().unwrap_or_default().to_owned(),
            receipt: Arc::new(Mutex::new(None)),
        }
    }
}

#[allow(non_snake_case)]
impl IFileOperationProgressSink_Impl for DeleteProgressSink {
    fn StartOperations(&self) -> windows::core::Result<()> {
        Ok(())
    }
    fn FinishOperations(&self, _result: HRESULT) -> windows::core::Result<()> {
        Ok(())
    }
    fn PreRenameItem(
        &self,
        _flags: u32,
        _item: Option<&IShellItem>,
        _new_name: &PCWSTR,
    ) -> windows::core::Result<()> {
        Ok(())
    }
    fn PostRenameItem(
        &self,
        _flags: u32,
        _item: Option<&IShellItem>,
        _new_name: &PCWSTR,
        _result: HRESULT,
        _new_item: Option<&IShellItem>,
    ) -> windows::core::Result<()> {
        Ok(())
    }
    fn PreMoveItem(
        &self,
        _flags: u32,
        _item: Option<&IShellItem>,
        _destination: Option<&IShellItem>,
        _new_name: &PCWSTR,
    ) -> windows::core::Result<()> {
        Ok(())
    }
    fn PostMoveItem(
        &self,
        _flags: u32,
        _item: Option<&IShellItem>,
        _destination: Option<&IShellItem>,
        _new_name: &PCWSTR,
        _result: HRESULT,
        _new_item: Option<&IShellItem>,
    ) -> windows::core::Result<()> {
        Ok(())
    }
    fn PreCopyItem(
        &self,
        _flags: u32,
        _item: Option<&IShellItem>,
        _destination: Option<&IShellItem>,
        _new_name: &PCWSTR,
    ) -> windows::core::Result<()> {
        Ok(())
    }
    fn PostCopyItem(
        &self,
        _flags: u32,
        _item: Option<&IShellItem>,
        _destination: Option<&IShellItem>,
        _new_name: &PCWSTR,
        _result: HRESULT,
        _new_item: Option<&IShellItem>,
    ) -> windows::core::Result<()> {
        Ok(())
    }
    fn PreDeleteItem(&self, _flags: u32, _item: Option<&IShellItem>) -> windows::core::Result<()> {
        Ok(())
    }

    fn PostDeleteItem(
        &self,
        _flags: u32,
        _item: Option<&IShellItem>,
        result: HRESULT,
        newly_created: Option<&IShellItem>,
    ) -> windows::core::Result<()> {
        result.ok()?;
        let Some(item) = newly_created else {
            return Ok(());
        };
        let receipt = trash::TrashItem {
            id: recycle_item_id(item)?,
            name: self.name.clone(),
            original_parent: self.original_parent.clone(),
            time_deleted: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64,
        };
        *self
            .receipt
            .lock()
            .expect("delete progress receipt mutex poisoned") = Some(receipt);
        Ok(())
    }

    fn PreNewItem(
        &self,
        _flags: u32,
        _destination: Option<&IShellItem>,
        _new_name: &PCWSTR,
    ) -> windows::core::Result<()> {
        Ok(())
    }
    fn PostNewItem(
        &self,
        _flags: u32,
        _destination: Option<&IShellItem>,
        _new_name: &PCWSTR,
        _template_name: &PCWSTR,
        _attributes: u32,
        _result: HRESULT,
        _new_item: Option<&IShellItem>,
    ) -> windows::core::Result<()> {
        Ok(())
    }
    fn UpdateProgress(&self, _total: u32, _completed: u32) -> windows::core::Result<()> {
        Ok(())
    }
    fn ResetTimer(&self) -> windows::core::Result<()> {
        Ok(())
    }
    fn PauseTimer(&self) -> windows::core::Result<()> {
        Ok(())
    }
    fn ResumeTimer(&self) -> windows::core::Result<()> {
        Ok(())
    }
}

struct ComApartment;

impl ComApartment {
    fn initialize() -> windows::core::Result<Self> {
        unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok()? };
        Ok(Self)
    }
}

impl Drop for ComApartment {
    fn drop(&mut self) {
        unsafe { CoUninitialize() };
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_trash_core_index_to_restore_receipt() {
        let original_path = r"D:\archive\test.txt";
        let deleted_at = 1_785_083_421_i64;
        let index = parse_index(&version_two_index(original_path, deleted_at)).unwrap();

        let item =
            trash_item_from_index(PathBuf::from(r"D:\$Recycle.Bin\S-1-5-21\$RABC.txt"), index)
                .unwrap();

        assert_eq!(
            item.id,
            OsString::from(r"D:\$Recycle.Bin\S-1-5-21\$RABC.txt")
        );
        assert_eq!(item.name, OsString::from("test.txt"));
        assert_eq!(item.original_parent, PathBuf::from(r"D:\archive"));
        assert_eq!(item.time_deleted, deleted_at);
    }

    #[test]
    fn accepts_directory_payload_omitted_by_trash_core_pairing() {
        let directory = std::env::temp_dir().join(format!(
            "xaihi-kisaki-trash-directory-pair-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&directory).unwrap();
        let index_path = directory.join("$IABCDEF");
        let content_path = directory.join("$RABCDEF");
        fs::write(&index_path, b"index").unwrap();
        fs::create_dir(&content_path).unwrap();

        let pair = scan_pairs(&directory)
            .unwrap()
            .into_iter()
            .find(|pair| pair.index_path == index_path)
            .unwrap();
        assert!(pair.content_path.is_none());
        assert_eq!(
            existing_content_path(&pair.index_path, pair.content_path),
            Some(content_path)
        );

        fs::remove_dir_all(directory).unwrap();
    }

    fn version_two_index(original_path: &str, deleted_at: i64) -> Vec<u8> {
        const WINDOWS_TO_UNIX_SECONDS: i64 = 11_644_473_600;
        let encoded = OsStr::new(original_path).encode_wide().collect::<Vec<_>>();
        let filetime = ((deleted_at + WINDOWS_TO_UNIX_SECONDS) as u64) * 10_000_000;
        let mut bytes = Vec::with_capacity(28 + encoded.len() * 2);
        bytes.extend_from_slice(&2_u64.to_le_bytes());
        bytes.extend_from_slice(&123_u64.to_le_bytes());
        bytes.extend_from_slice(&filetime.to_le_bytes());
        bytes.extend_from_slice(&(encoded.len() as u32).to_le_bytes());
        for character in encoded {
            bytes.extend_from_slice(&character.to_le_bytes());
        }
        bytes
    }
}
