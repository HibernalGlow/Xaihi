use std::path::PathBuf;

use napi::bindgen_prelude::{AsyncTask, Error, Result, Task};
use napi::{Env, Status};
use napi_derive::napi;
use xaihi_kisaki_core as core;

use crate::{ScanSession, run_controlled, saturating_i64};

#[napi(object)]
pub struct ExifScanOptions {
    pub included_directories: Vec<String>,
    pub reference_directories: Option<Vec<String>>,
    pub excluded_directories: Option<Vec<String>>,
    pub excluded_items: Option<Vec<String>>,
    pub allowed_extensions: Option<String>,
    pub excluded_extensions: Option<String>,
    pub recursive: Option<bool>,
    pub minimum_file_size: Option<i64>,
    pub maximum_file_size: Option<i64>,
    pub use_cache: Option<bool>,
    pub save_also_as_json: Option<bool>,
    pub delete_outdated_cache: Option<bool>,
    pub ignored_tags: Option<Vec<String>>,
    pub scan_id: Option<String>,
    pub thread_count: Option<u32>,
}

#[napi(object)]
pub struct ExifTag {
    pub name: String,
    pub code: u32,
    pub group: String,
}

#[napi(object)]
pub struct ExifEntry {
    pub path: String,
    pub size: i64,
    pub modified_date: i64,
    pub tags: Vec<ExifTag>,
}

#[napi(object)]
pub struct ExifScanResult {
    pub entries: Vec<ExifEntry>,
    pub messages: String,
    pub stopped: bool,
}

pub struct ExifScanTask {
    options: core::ExifScanOptions,
    session: Option<ScanSession>,
    thread_count: usize,
}

#[napi]
pub fn scan_exif_files(options: ExifScanOptions) -> Result<AsyncTask<ExifScanTask>> {
    let included = options
        .included_directories
        .into_iter()
        .map(PathBuf::from)
        .collect();
    let mut core_options = core::ExifScanOptions::new(included);
    core_options.reference_directories = paths(options.reference_directories);
    core_options.excluded_directories = paths(options.excluded_directories);
    core_options.excluded_items = options.excluded_items.unwrap_or_default();
    core_options.allowed_extensions = options.allowed_extensions.unwrap_or_default();
    core_options.excluded_extensions = options.excluded_extensions.unwrap_or_default();
    core_options.recursive = options.recursive.unwrap_or(true);
    core_options.minimum_file_size =
        non_negative_u64(options.minimum_file_size.unwrap_or(1), "minimumFileSize")?;
    core_options.maximum_file_size = non_negative_u64(
        options.maximum_file_size.unwrap_or(i64::MAX),
        "maximumFileSize",
    )?;
    core_options.use_cache = options.use_cache.unwrap_or(true);
    core_options.save_also_as_json = options.save_also_as_json.unwrap_or(false);
    core_options.delete_outdated_cache = options.delete_outdated_cache.unwrap_or(true);
    core_options.ignored_tags = options.ignored_tags.unwrap_or_default();
    Ok(AsyncTask::new(ExifScanTask {
        options: core_options,
        session: ScanSession::create(options.scan_id),
        thread_count: options.thread_count.unwrap_or(0) as usize,
    }))
}

impl Task for ExifScanTask {
    type Output = core::ExifScanResult;
    type JsValue = ExifScanResult;

    fn compute(&mut self) -> Result<Self::Output> {
        core::initialize_threads(self.thread_count);
        run_controlled(&self.session, |control| {
            core::scan_exif_files_controlled(self.options.clone(), control)
        })
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(ExifScanResult {
            entries: output
                .entries
                .into_iter()
                .map(|entry| ExifEntry {
                    path: entry.path.to_string_lossy().into_owned(),
                    size: saturating_i64(entry.size),
                    modified_date: saturating_i64(entry.modified_date),
                    tags: entry
                        .tags
                        .into_iter()
                        .map(|tag| ExifTag {
                            name: tag.name,
                            code: tag.code.into(),
                            group: tag.group,
                        })
                        .collect(),
                })
                .collect(),
            messages: output.messages,
            stopped: output.stopped,
        })
    }
}

#[napi(object)]
pub struct ExifCandidateOptions {
    pub source_path: String,
    pub tags: Vec<ExifTag>,
}

#[napi(object)]
pub struct ExifCandidate {
    pub candidate_path: String,
    pub removed_tags: u32,
}

pub struct ExifCandidateTask {
    source_path: PathBuf,
    tags: Vec<core::ExifTag>,
}

#[napi]
pub fn create_exif_candidate(
    options: ExifCandidateOptions,
) -> Result<AsyncTask<ExifCandidateTask>> {
    let source_path = PathBuf::from(options.source_path);
    if !source_path.is_absolute() {
        return Err(Error::new(
            Status::InvalidArg,
            "sourcePath must be absolute",
        ));
    }
    let tags = options
        .tags
        .into_iter()
        .map(|tag| {
            Ok(core::ExifTag {
                name: tag.name,
                code: u16::try_from(tag.code)
                    .map_err(|_| Error::new(Status::InvalidArg, "EXIF tag code must fit in u16"))?,
                group: tag.group,
            })
        })
        .collect::<Result<Vec<_>>>()?;
    Ok(AsyncTask::new(ExifCandidateTask { source_path, tags }))
}

impl Task for ExifCandidateTask {
    type Output = core::ExifCandidate;
    type JsValue = ExifCandidate;

    fn compute(&mut self) -> Result<Self::Output> {
        core::create_exif_candidate(self.source_path.clone(), self.tags.clone())
            .map_err(|error| Error::from_reason(error.to_string()))
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(ExifCandidate {
            candidate_path: output.path.to_string_lossy().into_owned(),
            removed_tags: output.removed_tags,
        })
    }
}

fn paths(values: Option<Vec<String>>) -> Vec<PathBuf> {
    values
        .unwrap_or_default()
        .into_iter()
        .map(PathBuf::from)
        .collect()
}

fn non_negative_u64(value: i64, name: &str) -> Result<u64> {
    u64::try_from(value)
        .map_err(|_| Error::new(Status::InvalidArg, format!("{name} cannot be negative")))
}
