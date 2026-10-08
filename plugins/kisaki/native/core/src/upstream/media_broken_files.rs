use czkawka_core::tools::broken_files::{BrokenFiles, BrokenFilesParameters, CheckedTypes};

use super::common::search_with_control;
use super::media::{configure_tool, result};
use crate::{CzkawkaError, MediaEntry, MediaGroup, MediaScanOptions, MediaScanResult, ScanControl};

pub(crate) fn scan(
    options: MediaScanOptions,
    control: &ScanControl,
) -> Result<MediaScanResult, CzkawkaError> {
    let mut tool = BrokenFiles::new(BrokenFilesParameters::new(checked_types(&options)));
    configure_tool(&mut tool, &options);
    search_with_control(&mut tool, control);
    let entries = tool
        .get_broken_files()
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
            detail: Some(
                entry
                    .errors
                    .iter()
                    .filter_map(|(kind, message)| {
                        message
                            .as_ref()
                            .map(|message| format!("{kind:?}: {message}"))
                    })
                    .collect::<Vec<_>>()
                    .join(", "),
            ),
            proper_extension: None,
        })
        .collect();
    Ok(result(&tool, vec![MediaGroup { entries }]))
}

fn checked_types(options: &MediaScanOptions) -> CheckedTypes {
    let mut checked = CheckedTypes::NONE;
    if options.broken_audio {
        checked |= CheckedTypes::AUDIO;
    }
    if options.broken_pdf {
        checked |= CheckedTypes::PDF;
    }
    if options.broken_image {
        checked |= CheckedTypes::IMAGE;
    }
    if options.broken_archive {
        checked |= CheckedTypes::ARCHIVE;
    }
    if options.broken_video_ffprobe {
        checked |= CheckedTypes::VIDEO_FFPROBE;
    }
    if options.broken_video_ffmpeg {
        checked |= CheckedTypes::VIDEO_FFMPEG;
    }
    if options.broken_font {
        checked |= CheckedTypes::FONT;
    }
    if options.broken_markup {
        checked |= CheckedTypes::MARKUP;
    }
    if checked == CheckedTypes::NONE {
        CheckedTypes::AUDIO
    } else {
        checked
    }
}

#[cfg(test)]
mod tests {
    use super::checked_types;
    use crate::{MediaScanOptions, MediaTool};
    use czkawka_core::tools::broken_files::CheckedTypes;

    #[test]
    fn maps_every_broken_file_checker_into_the_upstream_bitset() {
        let mut options = MediaScanOptions::new(MediaTool::BrokenFiles, Vec::new());
        options.broken_audio = false;
        options.broken_pdf = false;
        options.broken_archive = false;
        options.broken_image = false;
        options.broken_video_ffprobe = true;
        options.broken_video_ffmpeg = true;
        options.broken_font = true;
        options.broken_markup = true;

        assert_eq!(
            checked_types(&options),
            CheckedTypes::VIDEO_FFPROBE
                | CheckedTypes::VIDEO_FFMPEG
                | CheckedTypes::FONT
                | CheckedTypes::MARKUP
        );
    }
}
