use czkawka_core::tools::bad_names::{BadNames, BadNamesParameters};

use super::basic::{basic_result, configure_tool};
use super::common::search_with_control;
use crate::{BasicEntry, BasicScanOptions, BasicScanResult, CzkawkaError, ScanControl};

pub(crate) fn scan(
    options: BasicScanOptions,
    control: &ScanControl,
) -> Result<BasicScanResult, CzkawkaError> {
    let mut tool = BadNames::new(BadNamesParameters::default());
    configure_tool(&mut tool, &options);
    search_with_control(&mut tool, control);
    let entries = tool
        .get_bad_names_files()
        .iter()
        .map(|entry| BasicEntry {
            path: entry.path.clone(),
            size: entry.size,
            modified_date: entry.modified_date,
            secondary_path: Some(entry.path.with_file_name(&entry.new_name)),
            detail: None,
        })
        .collect();
    Ok(basic_result(&tool, entries))
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use crate::{BasicScanOptions, BasicTool, scan_basic_files};

    #[test]
    fn returns_a_proposed_target_without_renaming_the_source() {
        let directory = tempdir().unwrap();
        let source = directory.path().join("report-🙂.TXT");
        fs::write(&source, "content").unwrap();

        let result = scan_basic_files(BasicScanOptions::new(
            BasicTool::BadNames,
            vec![directory.path().to_path_buf()],
        ))
        .unwrap();

        assert!(source.exists());
        assert_eq!(result.entries.len(), 1);
        let proposed = result.entries[0].secondary_path.as_deref().unwrap();
        assert_eq!(proposed.file_name().unwrap(), "report-.txt");
        assert!(
            proposed
                .parent()
                .unwrap()
                .to_string_lossy()
                .eq_ignore_ascii_case(&directory.path().to_string_lossy())
        );
    }
}
