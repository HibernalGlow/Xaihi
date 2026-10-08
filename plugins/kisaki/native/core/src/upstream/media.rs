use czkawka_core::common::tool_data::CommonData;
use czkawka_core::helpers::messages::MessageLimit;

use super::common::{extension_list, initialize_cache_path};
use crate::{CzkawkaError, MediaScanOptions, MediaScanResult, MediaTool, ScanControl};

pub(crate) fn scan_media_files_controlled(
    options: MediaScanOptions,
    control: &ScanControl,
) -> Result<MediaScanResult, CzkawkaError> {
    initialize_cache_path();
    if options.included_directories.is_empty() {
        return Err(CzkawkaError::InvalidOption(
            "included_directories cannot be empty".into(),
        ));
    }
    match options.tool {
        MediaTool::SimilarImages => super::media_similar_images::scan(options, control),
        MediaTool::SimilarVideos => super::media_similar_videos::scan(options, control),
        MediaTool::DuplicateMusic => super::media_same_music::scan(options, control),
        MediaTool::BrokenFiles => super::media_broken_files::scan(options, control),
        MediaTool::BadExtensions => super::media_bad_extensions::scan(options, control),
    }
}

pub(crate) fn configure_tool<T: CommonData>(tool: &mut T, options: &MediaScanOptions) {
    tool.set_hide_hard_links(options.ignore_hard_links);
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

pub(crate) fn result<T: CommonData>(tool: &T, groups: Vec<crate::MediaGroup>) -> MediaScanResult {
    MediaScanResult {
        groups,
        messages: tool
            .get_text_messages()
            .create_messages_text(MessageLimit::NoLimit),
        stopped: tool.get_stopped_search(),
    }
}
