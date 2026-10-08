use czkawka_core::common::model::{CheckingMethod, HashType};
use czkawka_core::common::tool_data::CommonData;
use czkawka_core::helpers::messages::MessageLimit;
use czkawka_core::tools::duplicate::{DuplicateEntry, DuplicateFinder, DuplicateFinderParameters};

use super::common::{extension_list, initialize_cache_path, search_with_control};
use crate::{
    CzkawkaError, DuplicateCheckMethod, DuplicateFile, DuplicateGroup, DuplicateHashType,
    DuplicateScanOptions, DuplicateScanResult, ScanControl,
};

pub(crate) fn scan_duplicate_files_controlled(
    options: DuplicateScanOptions,
    control: &ScanControl,
) -> Result<DuplicateScanResult, CzkawkaError> {
    if options.included_directories.is_empty() {
        return Err(CzkawkaError::InvalidOption(
            "included_directories cannot be empty".into(),
        ));
    }
    if options.minimum_file_size > options.maximum_file_size {
        return Err(CzkawkaError::InvalidOption(
            "minimum_file_size cannot exceed maximum_file_size".into(),
        ));
    }
    initialize_cache_path();

    let check_method = match options.check_method {
        DuplicateCheckMethod::Name => CheckingMethod::Name,
        DuplicateCheckMethod::Size => CheckingMethod::Size,
        DuplicateCheckMethod::SizeAndName => CheckingMethod::SizeName,
        DuplicateCheckMethod::Hash => CheckingMethod::Hash,
    };
    let hash_type = match options.hash_type {
        DuplicateHashType::Crc32 => HashType::Crc32,
        DuplicateHashType::Xxh3 => HashType::Xxh3,
        DuplicateHashType::Blake3 => HashType::Blake3,
    };
    let mut finder = DuplicateFinder::new(DuplicateFinderParameters::new(
        check_method,
        hash_type,
        options.use_prehash,
        options.minimal_cache_file_size,
        options.minimal_prehash_cache_file_size,
        options.case_sensitive_names,
    ));
    finder.set_hide_hard_links(options.ignore_hard_links);
    finder.set_included_paths(options.included_directories);
    if !options.reference_directories.is_empty() {
        finder.set_reference_paths(options.reference_directories);
    }
    finder.set_excluded_paths(options.excluded_directories);
    finder.set_excluded_items(options.excluded_items);
    finder.set_allowed_extensions(extension_list(&options.allowed_extensions));
    finder.set_excluded_extensions(extension_list(&options.excluded_extensions));
    finder.set_minimal_file_size(options.minimum_file_size);
    finder.set_maximal_file_size(options.maximum_file_size);
    finder.set_recursive_search(options.recursive);
    finder.set_use_cache(options.use_cache);
    finder.set_save_also_as_json(options.save_also_as_json);
    finder.set_delete_outdated_cache(options.delete_outdated_cache);

    search_with_control(&mut finder, control);
    let raw_groups: Vec<Vec<(DuplicateEntry, bool)>> = if finder.get_use_reference() {
        match check_method {
            CheckingMethod::Hash => finder
                .get_files_with_identical_hashes_referenced()
                .values()
                .flatten()
                .map(referenced_duplicate_group)
                .collect(),
            CheckingMethod::Name => finder
                .get_files_with_identical_name_referenced()
                .values()
                .map(referenced_duplicate_group)
                .collect(),
            CheckingMethod::Size => finder
                .get_files_with_identical_size_referenced()
                .values()
                .map(referenced_duplicate_group)
                .collect(),
            CheckingMethod::SizeName => finder
                .get_files_with_identical_size_names_referenced()
                .values()
                .map(referenced_duplicate_group)
                .collect(),
            _ => unreachable!(),
        }
    } else {
        match check_method {
            CheckingMethod::Hash => finder
                .get_files_sorted_by_hash()
                .values()
                .flatten()
                .map(|group| group.iter().cloned().map(|entry| (entry, false)).collect())
                .collect(),
            CheckingMethod::Name => finder
                .get_files_sorted_by_names()
                .values()
                .map(|group| group.iter().cloned().map(|entry| (entry, false)).collect())
                .collect(),
            CheckingMethod::Size => finder
                .get_files_sorted_by_size()
                .values()
                .map(|group| group.iter().cloned().map(|entry| (entry, false)).collect())
                .collect(),
            CheckingMethod::SizeName => finder
                .get_files_sorted_by_size_name()
                .values()
                .map(|group| group.iter().cloned().map(|entry| (entry, false)).collect())
                .collect(),
            _ => unreachable!(),
        }
    };
    let groups = raw_groups
        .into_iter()
        .map(|mut entries| {
            entries.sort_unstable_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.path.cmp(&b.0.path)));
            DuplicateGroup {
                files: entries
                    .into_iter()
                    .map(|(entry, is_reference)| DuplicateFile {
                        path: entry.path,
                        modified_date: entry.modified_date,
                        size: entry.size,
                        hash: entry.hash,
                        is_reference,
                    })
                    .collect(),
            }
        })
        .collect();
    Ok(DuplicateScanResult {
        groups,
        messages: finder
            .get_text_messages()
            .create_messages_text(MessageLimit::NoLimit),
        stopped: finder.get_stopped_search(),
    })
}

fn referenced_duplicate_group(
    group: &(DuplicateEntry, Vec<DuplicateEntry>),
) -> Vec<(DuplicateEntry, bool)> {
    std::iter::once((group.0.clone(), true))
        .chain(group.1.iter().cloned().map(|entry| (entry, false)))
        .collect()
}
