use std::fs::{self, OpenOptions};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use czkawka_core::common::tool_data::CommonData;
use czkawka_core::helpers::messages::MessageLimit;
use czkawka_core::tools::exif_remover::core::clean_exif_tags;
use czkawka_core::tools::exif_remover::{ExifRemover, ExifRemoverParameters};

use super::common::{extension_list, initialize_cache_path, search_with_control};
use crate::{
    CzkawkaError, ExifCandidate, ExifEntry, ExifScanOptions, ExifScanResult, ExifTag, ScanControl,
};

pub(crate) fn scan(
    options: ExifScanOptions,
    control: &ScanControl,
) -> Result<ExifScanResult, CzkawkaError> {
    initialize_cache_path();
    if options.included_directories.is_empty() {
        return Err(CzkawkaError::InvalidOption(
            "included_directories cannot be empty".into(),
        ));
    }

    let mut tool = ExifRemover::new(ExifRemoverParameters::new(options.ignored_tags.clone()));
    configure_tool(&mut tool, &options);
    search_with_control(&mut tool, control);
    let mut entries = tool
        .get_exif_files()
        .iter()
        .map(|entry| ExifEntry {
            path: entry.path.clone(),
            size: entry.size,
            modified_date: entry.modified_date,
            tags: entry
                .exif_tags
                .iter()
                .map(|tag| ExifTag {
                    name: tag.name.clone(),
                    code: tag.code,
                    group: tag.group.clone(),
                })
                .collect(),
        })
        .collect::<Vec<_>>();
    entries.sort_unstable_by(|left, right| left.path.cmp(&right.path));
    Ok(ExifScanResult {
        entries,
        messages: tool
            .get_text_messages()
            .create_messages_text(MessageLimit::NoLimit),
        stopped: tool.get_stopped_search(),
    })
}

pub(crate) fn create_candidate(
    source: PathBuf,
    tags: Vec<ExifTag>,
) -> Result<ExifCandidate, CzkawkaError> {
    if tags.is_empty() {
        return Err(CzkawkaError::InvalidOption(
            "at least one EXIF tag is required".into(),
        ));
    }
    if !source.is_file() {
        return Err(CzkawkaError::InvalidOption(
            "EXIF source must be an existing file".into(),
        ));
    }

    let candidate = reserve_candidate_path(&source)?;
    let result = (|| {
        fs::copy(&source, &candidate).map_err(io_error)?;
        let tags_to_remove = tags
            .iter()
            .map(|tag| (tag.code, tag.group.clone()))
            .collect::<Vec<_>>();
        let removed_tags = clean_exif_tags(&candidate.to_string_lossy(), &tags_to_remove, true)
            .map_err(CzkawkaError::Operation)?;
        Ok(ExifCandidate {
            path: candidate.clone(),
            removed_tags,
        })
    })();
    if result.is_err() {
        let _ = fs::remove_file(&candidate);
    }
    result
}

fn configure_tool<T: CommonData>(tool: &mut T, options: &ExifScanOptions) {
    tool.set_included_paths(options.included_directories.clone());
    if !options.reference_directories.is_empty() {
        tool.set_reference_paths(options.reference_directories.clone());
    }
    tool.set_excluded_paths(options.excluded_directories.clone());
    tool.set_excluded_items(options.excluded_items.clone());
    tool.set_allowed_extensions(extension_list(&options.allowed_extensions));
    tool.set_excluded_extensions(extension_list(&options.excluded_extensions));
    tool.set_recursive_search(options.recursive);
    tool.set_minimal_file_size(options.minimum_file_size);
    tool.set_maximal_file_size(options.maximum_file_size);
    tool.set_use_cache(options.use_cache);
    tool.set_save_also_as_json(options.save_also_as_json);
    tool.set_delete_outdated_cache(options.delete_outdated_cache);
}

fn reserve_candidate_path(source: &Path) -> Result<PathBuf, CzkawkaError> {
    static NEXT_ID: AtomicU64 = AtomicU64::new(0);
    let root = std::env::temp_dir().join("xaihi-kisaki-exif");
    fs::create_dir_all(&root).map_err(io_error)?;
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("bin");
    for _ in 0..128 {
        let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
        let candidate = root.join(format!("candidate-{}-{id}.{extension}", std::process::id(),));
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(file) => {
                drop(file);
                return Ok(candidate);
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(io_error(error)),
        }
    }
    Err(CzkawkaError::Operation(
        "unable to reserve an EXIF candidate path".into(),
    ))
}

fn io_error(error: std::io::Error) -> CzkawkaError {
    CzkawkaError::Operation(error.to_string())
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use super::{create_candidate, scan};
    use crate::{ExifScanOptions, ExifTag, ScanControl};

    #[test]
    fn rejects_a_candidate_without_selected_tags_before_writing() {
        let directory = tempdir().unwrap();
        let source = directory.path().join("photo.jpg");
        fs::write(&source, "source").unwrap();

        let error = create_candidate(source.clone(), Vec::new()).unwrap_err();

        assert_eq!(
            error.to_string(),
            "invalid option: at least one EXIF tag is required"
        );
        assert_eq!(fs::read_to_string(source).unwrap(), "source");
    }

    #[test]
    fn rejects_a_missing_source_before_reserving_a_candidate() {
        let directory = tempdir().unwrap();
        let error = create_candidate(
            directory.path().join("missing.jpg"),
            vec![ExifTag {
                name: "Artist".into(),
                code: 315,
                group: "GENERIC".into(),
            }],
        )
        .unwrap_err();

        assert_eq!(
            error.to_string(),
            "invalid option: EXIF source must be an existing file"
        );
    }

    #[test]
    fn creates_a_clean_candidate_without_changing_the_source() {
        let directory = tempdir().unwrap();
        let source = directory.path().join("photo.jpg");
        fs::write(&source, jpeg_with_image_description_tag()).unwrap();
        let source_before = fs::read(&source).unwrap();

        let mut scan_options = ExifScanOptions::new(vec![source.clone()]);
        scan_options.use_cache = false;
        let scan_result = scan(scan_options, &ScanControl::detached()).unwrap();
        let entry = scan_result
            .entries
            .iter()
            .find(|entry| {
                entry
                    .path
                    .file_name()
                    .is_some_and(|name| name.eq_ignore_ascii_case("photo.jpg"))
            })
            .expect("the injected EXIF tag should be scanned");
        assert!(
            entry
                .tags
                .iter()
                .any(|tag| tag.code == 0x010e && tag.group == "GENERIC")
        );

        let candidate = create_candidate(source.clone(), entry.tags.clone()).unwrap();

        assert!(candidate.removed_tags > 0);
        assert_eq!(fs::read(&source).unwrap(), source_before);

        let mut candidate_scan_options = ExifScanOptions::new(vec![candidate.path.clone()]);
        candidate_scan_options.use_cache = false;
        let candidate_scan = scan(candidate_scan_options, &ScanControl::detached()).unwrap();
        assert!(candidate_scan.entries.is_empty());

        fs::remove_file(candidate.path).unwrap();
    }

    fn jpeg_with_image_description_tag() -> Vec<u8> {
        const BASE_JPEG: &[u8] =
            include_bytes!("../../test-fixtures/placeholder_cover.jpg");
        assert_eq!(&BASE_JPEG[..2], &[0xff, 0xd8]);

        let exif_segment = [
            0xff, 0xe1, 0x00, 0x28, b'E', b'x', b'i', b'f', 0x00, 0x00, b'I', b'I', 0x2a, 0x00,
            0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x0e, 0x01, 0x02, 0x00, 0x06, 0x00, 0x00, 0x00,
            0x1a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, b'h', b'e', b'l', b'l', b'o', 0x00,
        ];
        let mut output = Vec::with_capacity(BASE_JPEG.len() + exif_segment.len());
        output.extend_from_slice(&BASE_JPEG[..2]);
        output.extend_from_slice(&exif_segment);
        output.extend_from_slice(&BASE_JPEG[2..]);
        output
    }
}
