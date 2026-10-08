use napi::Env;
use napi::bindgen_prelude::{Result, Task};
use xaihi_kisaki_core as core;

use crate::{BasicEntry, BasicScanResult, ScanSession, run_controlled, saturating_i64};

pub struct BasicScanTask {
    options: core::BasicScanOptions,
    session: Option<ScanSession>,
    thread_count: usize,
}

impl BasicScanTask {
    pub(crate) fn new(
        options: core::BasicScanOptions,
        session: Option<ScanSession>,
        thread_count: usize,
    ) -> Self {
        Self {
            options,
            session,
            thread_count,
        }
    }
}

impl Task for BasicScanTask {
    type Output = core::BasicScanResult;
    type JsValue = BasicScanResult;

    fn compute(&mut self) -> Result<Self::Output> {
        core::initialize_threads(self.thread_count);
        run_controlled(&self.session, |control| {
            core::scan_basic_files_controlled(self.options.clone(), control)
        })
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(BasicScanResult {
            entries: output
                .entries
                .into_iter()
                .map(|entry| BasicEntry {
                    path: entry.path.to_string_lossy().into_owned(),
                    size: saturating_i64(entry.size),
                    modified_date: saturating_i64(entry.modified_date),
                    secondary_path: entry
                        .secondary_path
                        .map(|path| path.to_string_lossy().into_owned()),
                    detail: entry.detail,
                })
                .collect(),
            messages: output.messages,
            stopped: output.stopped,
        })
    }
}
