use std::fs;

use tempfile::tempdir;

use crate::{CAPABILITIES, DuplicateScanOptions, scan_duplicate_files};

#[test]
fn advertises_czkawka_12_media_capabilities() {
    assert!(CAPABILITIES.contains(&"similar-images.geometric-invariance"));
    assert!(CAPABILITIES.contains(&"similar-images.same-resolution-exclusion"));
    assert!(CAPABILITIES.contains(&"similar-videos.similario"));
    assert!(CAPABILITIES.contains(&"similar-videos.same-resolution-exclusion"));
    assert!(CAPABILITIES.contains(&"similar-videos.audio"));
    assert!(CAPABILITIES.contains(&"broken-files.multi-checker"));
    assert!(CAPABILITIES.contains(&"empty-files.content-checkers"));
    assert!(CAPABILITIES.contains(&"temporary-files.custom-extensions"));
    assert!(CAPABILITIES.contains(&"scan.bad-names"));
}

#[test]
fn duplicate_scan_returns_identical_files() {
    let dir = tempdir().unwrap();
    fs::write(dir.path().join("one.bin"), b"same-content").unwrap();
    fs::write(dir.path().join("two.bin"), b"same-content").unwrap();
    fs::write(dir.path().join("different.bin"), b"different-content").unwrap();

    let options = DuplicateScanOptions::new(vec![dir.path().to_path_buf()]);
    let result = scan_duplicate_files(options).unwrap();
    assert_eq!(result.groups.len(), 1);
    assert_eq!(result.groups[0].files.len(), 2);
    assert!(!result.stopped);
}
