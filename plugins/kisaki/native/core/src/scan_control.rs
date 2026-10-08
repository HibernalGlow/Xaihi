use std::sync::Arc;
use std::sync::atomic::AtomicBool;

use crossbeam_channel::{Receiver, Sender, unbounded};

#[derive(Debug, Clone)]
pub struct ScanProgress {
    pub stage: String,
    pub stage_index: u8,
    pub stage_count: u8,
    pub entries_checked: usize,
    pub entries_total: usize,
    pub bytes_checked: u64,
    pub bytes_total: u64,
}

#[derive(Clone)]
pub struct ScanControl {
    pub(crate) stop: Arc<AtomicBool>,
    progress: Option<Sender<ScanProgress>>,
}

impl ScanControl {
    pub fn detached() -> Self {
        Self {
            stop: Arc::new(AtomicBool::new(false)),
            progress: None,
        }
    }

    pub fn channel(stop: Arc<AtomicBool>) -> (Self, Receiver<ScanProgress>) {
        let (sender, receiver) = unbounded();
        (
            Self {
                stop,
                progress: Some(sender),
            },
            receiver,
        )
    }

    pub(crate) fn progress_sender(&self) -> Option<Sender<ScanProgress>> {
        self.progress.clone()
    }
}
