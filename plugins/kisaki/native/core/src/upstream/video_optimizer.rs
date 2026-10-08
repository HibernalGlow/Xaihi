use std::fs::{self, OpenOptions};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use czkawka_core::common::tool_data::CommonData;
use czkawka_core::helpers::messages::MessageLimit;
use czkawka_core::tools::video_optimizer::core::{fix_video_crop, process_video};
use czkawka_core::tools::video_optimizer::{
    NoiseReductionMethod, VideoCodec, VideoCropParams, VideoCropSingleFixParams,
    VideoCroppingMechanism, VideoOptimizer, VideoOptimizerParameters, VideoTranscodeFixParams,
    VideoTranscodeParams,
};

use super::common::{extension_list, initialize_cache_path, search_with_control};
use crate::{
    CzkawkaError, ScanControl, VideoOptimizerCandidate, VideoOptimizerCandidateOptions,
    VideoOptimizerCodec, VideoOptimizerCropMechanism, VideoOptimizerCropRect, VideoOptimizerEntry,
    VideoOptimizerMode, VideoOptimizerNoiseReduction, VideoOptimizerScanOptions,
    VideoOptimizerScanResult,
};

pub(crate) fn scan(
    options: VideoOptimizerScanOptions,
    control: &ScanControl,
) -> Result<VideoOptimizerScanResult, CzkawkaError> {
    initialize_cache_path();
    if options.included_directories.is_empty() {
        return Err(CzkawkaError::InvalidOption(
            "included_directories cannot be empty".into(),
        ));
    }

    let params = match options.mode {
        VideoOptimizerMode::Transcode => VideoOptimizerParameters::VideoTranscode(
            VideoTranscodeParams::new(options.excluded_codecs.clone(), false, 10, false, 2),
        ),
        VideoOptimizerMode::Crop => {
            VideoOptimizerParameters::VideoCrop(VideoCropParams::with_custom_params(
                VideoCroppingMechanism::BlackBars,
                options.black_pixel_threshold,
                options.black_bar_min_percentage,
                options.max_samples,
                options.min_crop_size,
                false,
                10,
                false,
                2,
            ))
        }
    };
    let mut tool = VideoOptimizer::new(params);
    configure_tool(&mut tool, &options);
    search_with_control(&mut tool, control);

    let mut entries = match options.mode {
        VideoOptimizerMode::Transcode => tool
            .get_video_transcode_entries()
            .iter()
            .map(|entry| VideoOptimizerEntry {
                path: entry.path.clone(),
                size: entry.size,
                modified_date: entry.modified_date,
                codec: entry.codec.clone(),
                width: entry.width,
                height: entry.height,
                duration: entry.duration,
                crop_rect: None,
            })
            .collect::<Vec<_>>(),
        VideoOptimizerMode::Crop => tool
            .get_video_crop_entries()
            .iter()
            .filter_map(|entry| {
                let crop_rect = crop_rect(entry.new_image_dimensions)?;
                Some(VideoOptimizerEntry {
                    path: entry.path.clone(),
                    size: entry.size,
                    modified_date: entry.modified_date,
                    codec: entry.codec.clone(),
                    width: entry.width,
                    height: entry.height,
                    duration: entry.duration,
                    crop_rect: Some(crop_rect),
                })
            })
            .collect::<Vec<_>>(),
    };
    entries.sort_unstable_by(|left, right| left.path.cmp(&right.path));
    Ok(VideoOptimizerScanResult {
        entries,
        messages: tool
            .get_text_messages()
            .create_messages_text(MessageLimit::NoLimit),
        stopped: tool.get_stopped_search(),
    })
}

pub(crate) fn create_candidate(
    options: VideoOptimizerCandidateOptions,
    control: &ScanControl,
) -> Result<VideoOptimizerCandidate, CzkawkaError> {
    if !options.source.is_file() {
        return Err(CzkawkaError::InvalidOption(
            "video optimizer source must be an existing file".into(),
        ));
    }
    if options.maximum_width == 0 || options.maximum_height == 0 {
        return Err(CzkawkaError::InvalidOption(
            "video optimizer maximum dimensions must be positive".into(),
        ));
    }

    let original_size = fs::metadata(&options.source).map_err(io_error)?.len();
    let input = reserve_input_path(&options.source)?;
    let result = (|| {
        fs::copy(&options.source, &input).map_err(io_error)?;
        let candidate = match options.mode {
            VideoOptimizerMode::Transcode => {
                let candidate = input.with_extension("czkawka_optimized.mp4");
                process_video(
                    &control.stop,
                    &input.to_string_lossy(),
                    original_size,
                    &VideoTranscodeFixParams {
                        codec: codec(options.target_codec),
                        hardware_encoder: Default::default(),
                        quality: options.quality,
                        fail_if_not_smaller: options.fail_if_not_smaller,
                        overwrite_original: false,
                        limit_video_size: options.limit_video_size,
                        max_width: options.maximum_width,
                        max_height: options.maximum_height,
                        noise_reduction: noise_reduction(options.noise_reduction),
                        noise_reduction_strength: options.noise_reduction_strength,
                        custom_ffmpeg_command: None,
                    },
                )
                .map_err(CzkawkaError::Operation)?;
                candidate
            }
            VideoOptimizerMode::Crop => {
                let crop_rect = options.crop_rect.ok_or_else(|| {
                    CzkawkaError::InvalidOption(
                        "video crop candidate requires a scanned crop rectangle".into(),
                    )
                })?;
                let suffix = match options.crop_mechanism {
                    VideoOptimizerCropMechanism::BlackBars => "blackbars",
                    VideoOptimizerCropMechanism::StaticContent => "staticcontent",
                };
                let extension = input
                    .extension()
                    .and_then(|value| value.to_str())
                    .filter(|value| !value.is_empty())
                    .unwrap_or("mp4");
                let candidate =
                    input.with_extension(format!("czkawka_cropped_{suffix}.{extension}"));
                fix_video_crop(
                    &input,
                    &VideoCropSingleFixParams {
                        overwrite_original: false,
                        target_codec: options.crop_transcode.then(|| codec(options.target_codec)),
                        quality: options.crop_transcode.then_some(options.quality),
                        crop_rectangle: (
                            crop_rect.left,
                            crop_rect.top,
                            crop_rect.right,
                            crop_rect.bottom,
                        ),
                        crop_mechanism: crop_mechanism(options.crop_mechanism),
                    },
                    &control.stop,
                    &options.current_codec,
                )
                .map_err(CzkawkaError::Operation)?;
                candidate
            }
        };
        let candidate_size = fs::metadata(&candidate).map_err(io_error)?.len();
        if candidate_size == 0 {
            return Err(CzkawkaError::Operation(
                "video optimizer produced an empty candidate".into(),
            ));
        }
        Ok(VideoOptimizerCandidate {
            path: candidate,
            original_size,
            candidate_size,
        })
    })();
    let _ = fs::remove_file(&input);
    if result.is_err() {
        let _ = fs::remove_file(input.with_extension("czkawka_optimized.mp4"));
        for suffix in ["blackbars", "staticcontent"] {
            let extension = input
                .extension()
                .and_then(|value| value.to_str())
                .filter(|value| !value.is_empty())
                .unwrap_or("mp4");
            let _ = fs::remove_file(
                input.with_extension(format!("czkawka_cropped_{suffix}.{extension}")),
            );
        }
    }
    result
}

fn configure_tool<T: CommonData>(tool: &mut T, options: &VideoOptimizerScanOptions) {
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

fn reserve_input_path(source: &Path) -> Result<PathBuf, CzkawkaError> {
    static NEXT_ID: AtomicU64 = AtomicU64::new(0);
    let root = std::env::temp_dir().join("xaihi-kisaki-video-optimizer");
    fs::create_dir_all(&root).map_err(io_error)?;
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("mp4");
    for _ in 0..128 {
        let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
        let input = root.join(format!("input-{}-{id}.{extension}", std::process::id()));
        match OpenOptions::new().write(true).create_new(true).open(&input) {
            Ok(file) => {
                drop(file);
                return Ok(input);
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(io_error(error)),
        }
    }
    Err(CzkawkaError::Operation(
        "unable to reserve a video optimizer candidate path".into(),
    ))
}

fn codec(value: VideoOptimizerCodec) -> VideoCodec {
    match value {
        VideoOptimizerCodec::H264 => VideoCodec::H264,
        VideoOptimizerCodec::H265 => VideoCodec::H265,
        VideoOptimizerCodec::Av1 => VideoCodec::Av1,
        VideoOptimizerCodec::Vp9 => VideoCodec::Vp9,
    }
}

fn noise_reduction(value: VideoOptimizerNoiseReduction) -> NoiseReductionMethod {
    match value {
        VideoOptimizerNoiseReduction::None => NoiseReductionMethod::None,
        VideoOptimizerNoiseReduction::Hqdn3d => NoiseReductionMethod::Hqdn3d,
    }
}

fn crop_mechanism(value: VideoOptimizerCropMechanism) -> VideoCroppingMechanism {
    match value {
        VideoOptimizerCropMechanism::BlackBars => VideoCroppingMechanism::BlackBars,
        VideoOptimizerCropMechanism::StaticContent => VideoCroppingMechanism::StaticContent,
    }
}

fn crop_rect((left, top, right, bottom): (u32, u32, u32, u32)) -> Option<VideoOptimizerCropRect> {
    (left < right && top < bottom).then_some(VideoOptimizerCropRect {
        left,
        top,
        right,
        bottom,
    })
}

fn io_error(error: std::io::Error) -> CzkawkaError {
    CzkawkaError::Operation(error.to_string())
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use super::{create_candidate, crop_rect};
    use crate::{
        ScanControl, VideoOptimizerCandidateOptions, VideoOptimizerCodec, VideoOptimizerMode,
    };

    #[test]
    fn rejects_a_missing_source_before_reserving_a_candidate() {
        let directory = tempdir().unwrap();
        let error = create_candidate(
            VideoOptimizerCandidateOptions {
                source: directory.path().join("missing.mp4"),
                mode: VideoOptimizerMode::Transcode,
                target_codec: VideoOptimizerCodec::H264,
                quality: 23,
                fail_if_not_smaller: true,
                limit_video_size: false,
                maximum_width: 1920,
                maximum_height: 1080,
                noise_reduction: Default::default(),
                noise_reduction_strength: 5,
                crop_rect: None,
                crop_mechanism: Default::default(),
                crop_transcode: false,
                current_codec: "h264".into(),
            },
            &ScanControl::detached(),
        )
        .unwrap_err();

        assert_eq!(
            error.to_string(),
            "invalid option: video optimizer source must be an existing file"
        );
        assert!(fs::read_dir(directory.path()).unwrap().next().is_none());
    }

    #[test]
    fn omits_an_upstream_default_crop_rectangle() {
        assert_eq!(crop_rect((0, 0, 0, 0)), None);
        assert_eq!(crop_rect((10, 20, 300, 200)).unwrap().left, 10);
    }
}
