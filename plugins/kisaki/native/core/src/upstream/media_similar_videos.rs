use czkawka_core::tools::similar_videos::{
    DEFAULT_AUDIO_LENGTH_RATIO, DEFAULT_AUDIO_MAXIMUM_DIFFERENCE,
    DEFAULT_AUDIO_MIN_DURATION_SECONDS, DEFAULT_AUDIO_SIMILARITY_PERCENT,
    DEFAULT_THUMBNAIL_GRID_TILES_PER_SIDE, DEFAULT_VIDEO_PERCENTAGE_FOR_THUMBNAIL, SimilarVideos,
    SimilarVideosParameters, VideosEntry,
};

use super::common::search_with_control;
use super::media::{configure_tool, result};
use crate::{
    CzkawkaError, MediaEntry, MediaGroup, MediaScanOptions, MediaScanResult, ScanControl,
    VideoCropDetect,
};

pub(crate) fn scan(
    options: MediaScanOptions,
    control: &ScanControl,
) -> Result<MediaScanResult, CzkawkaError> {
    let mut tool = SimilarVideos::new(parameters(&options));
    configure_tool(&mut tool, &options);
    search_with_control(&mut tool, control);
    let groups = if tool.get_use_reference() {
        tool.get_similar_videos_referenced()
            .iter()
            .map(|(reference, others)| MediaGroup {
                entries: std::iter::once(media_entry(reference, true))
                    .chain(others.iter().map(|entry| media_entry(entry, false)))
                    .collect(),
            })
            .collect()
    } else {
        tool.get_similar_videos()
            .iter()
            .map(|group| MediaGroup {
                entries: group
                    .first()
                    .map(|_baseline| {
                        group
                            .iter()
                            .map(|entry| media_entry(entry, false))
                            .collect()
                    })
                    .unwrap_or_default(),
            })
            .collect()
    };
    Ok(result(&tool, groups))
}

fn parameters(options: &MediaScanOptions) -> SimilarVideosParameters {
    let crop_detect = match options.video_crop_detect {
        VideoCropDetect::Letterbox | VideoCropDetect::Motion => true,
        VideoCropDetect::None => false,
    };
    SimilarVideosParameters::new(
        options.similarity.min(20) as i32,
        options.video_ignore_same_size,
        options.video_ignore_same_resolution,
        options.video_skip_forward,
        options.video_hash_duration,
        crop_detect,
        options.video_window_count,
        options.video_duration_tolerance_pct,
        options.video_min_matching_windows,
        options.video_subclip_min_match,
        false,
        DEFAULT_VIDEO_PERCENTAGE_FOR_THUMBNAIL,
        false,
        DEFAULT_THUMBNAIL_GRID_TILES_PER_SIDE,
        options.video_check_audio_content,
        DEFAULT_AUDIO_SIMILARITY_PERCENT,
        DEFAULT_AUDIO_MAXIMUM_DIFFERENCE,
        DEFAULT_AUDIO_LENGTH_RATIO,
        DEFAULT_AUDIO_MIN_DURATION_SECONDS,
    )
}

fn media_entry(entry: &VideosEntry, is_reference: bool) -> MediaEntry {
    MediaEntry {
        path: entry.path.clone(),
        size: entry.size,
        modified_date: entry.modified_date,
        width: entry.width,
        height: entry.height,
        fps: entry.fps,
        codec: entry.codec.clone(),
        similarity: None,
        title: None,
        artist: None,
        year: None,
        length: entry.duration.map(|duration| format!("{duration:.2} s")),
        genre: None,
        bitrate: entry
            .bitrate
            .and_then(|bitrate| u32::try_from(bitrate).ok()),
        is_reference,
        detail: (!entry.error.is_empty()).then(|| entry.error.clone()),
        proper_extension: None,
    }
}

#[cfg(test)]
mod tests {
    use super::parameters;
    use crate::{MediaScanOptions, MediaTool};

    #[test]
    fn maps_similario_controls_to_upstream_parameters() {
        let mut options = MediaScanOptions::new(MediaTool::SimilarVideos, Vec::new());
        options.video_ignore_same_resolution = true;
        options.video_window_count = 12;
        options.video_duration_tolerance_pct = 35.0;
        options.video_min_matching_windows = 0.75;
        options.video_subclip_min_match = 0.4;
        options.video_check_audio_content = true;

        let parameters = parameters(&options);
        assert!(parameters.exclude_videos_with_same_resolution);
        assert_eq!(parameters.window_count, 12);
        assert_eq!(parameters.duration_tolerance_pct, 35.0);
        assert_eq!(parameters.min_matching_windows, 0.75);
        assert_eq!(parameters.subclip_min_match, 0.4);
        assert!(parameters.check_audio_content);
    }
}
