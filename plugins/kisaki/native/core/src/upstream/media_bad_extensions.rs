use czkawka_core::tools::bad_extensions::{BadExtensions, BadExtensionsParameters};

use super::common::search_with_control;
use super::media::{configure_tool, result};
use crate::{CzkawkaError, MediaEntry, MediaGroup, MediaScanOptions, MediaScanResult, ScanControl};

pub(crate) fn scan(
    options: MediaScanOptions,
    control: &ScanControl,
) -> Result<MediaScanResult, CzkawkaError> {
    let mut tool = BadExtensions::new(BadExtensionsParameters::new());
    configure_tool(&mut tool, &options);
    search_with_control(&mut tool, control);
    let entries = tool
        .get_bad_extensions_files()
        .iter()
        .map(|entry| MediaEntry {
            path: entry.path.clone(),
            size: entry.size,
            modified_date: entry.modified_date,
            width: None,
            height: None,
            fps: None,
            codec: None,
            similarity: None,
            title: None,
            artist: None,
            year: None,
            length: None,
            genre: None,
            bitrate: None,
            is_reference: false,
            detail: Some(format!("current: {}", entry.current_extension)),
            proper_extension: Some(entry.proper_extension.clone()),
        })
        .collect();
    Ok(result(&tool, vec![MediaGroup { entries }]))
}
