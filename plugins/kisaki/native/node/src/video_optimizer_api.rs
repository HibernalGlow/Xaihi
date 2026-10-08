use std::path::PathBuf;

use napi::bindgen_prelude::{AsyncTask, Error, Result, Task};
use napi::{Env, Status};
use napi_derive::napi;
use xaihi_kisaki_core as core;

use crate::{ScanSession, run_controlled, saturating_i64};

#[napi(object)]
pub struct VideoOptimizerScanOptions {
    pub mode: String,
    pub included_directories: Vec<String>,
    pub reference_directories: Option<Vec<String>>,
    pub excluded_directories: Option<Vec<String>>,
    pub excluded_items: Option<Vec<String>>,
    pub allowed_extensions: Option<String>,
    pub excluded_extensions: Option<String>,
    pub recursive: Option<bool>,
    pub minimum_file_size: Option<i64>,
    pub maximum_file_size: Option<i64>,
    pub use_cache: Option<bool>,
    pub save_also_as_json: Option<bool>,
    pub delete_outdated_cache: Option<bool>,
    pub excluded_codecs: Option<String>,
    pub black_pixel_threshold: Option<u32>,
    pub black_bar_min_percentage: Option<u32>,
    pub max_samples: Option<u32>,
    pub min_crop_size: Option<u32>,
    pub scan_id: Option<String>,
    pub thread_count: Option<u32>,
}

#[napi(object)]
pub struct VideoOptimizerEntry {
    pub path: String,
    pub size: i64,
    pub modified_date: i64,
    pub codec: String,
    pub width: u32,
    pub height: u32,
    pub duration: f64,
    pub crop_left: Option<u32>,
    pub crop_top: Option<u32>,
    pub crop_right: Option<u32>,
    pub crop_bottom: Option<u32>,
}

#[napi(object)]
pub struct VideoOptimizerScanResult {
    pub entries: Vec<VideoOptimizerEntry>,
    pub messages: String,
    pub stopped: bool,
}

pub struct VideoOptimizerScanTask {
    options: core::VideoOptimizerScanOptions,
    session: Option<ScanSession>,
    thread_count: usize,
}

#[napi]
pub fn scan_video_optimizer(
    options: VideoOptimizerScanOptions,
) -> Result<AsyncTask<VideoOptimizerScanTask>> {
    let mode = mode(&options.mode)?;
    let included = options
        .included_directories
        .into_iter()
        .map(PathBuf::from)
        .collect();
    let mut core_options = core::VideoOptimizerScanOptions::new(mode, included);
    core_options.reference_directories = paths(options.reference_directories);
    core_options.excluded_directories = paths(options.excluded_directories);
    core_options.excluded_items = options.excluded_items.unwrap_or_default();
    core_options.allowed_extensions = options.allowed_extensions.unwrap_or_default();
    core_options.excluded_extensions = options.excluded_extensions.unwrap_or_default();
    core_options.recursive = options.recursive.unwrap_or(true);
    core_options.minimum_file_size =
        non_negative_u64(options.minimum_file_size.unwrap_or(1), "minimumFileSize")?;
    core_options.maximum_file_size = non_negative_u64(
        options.maximum_file_size.unwrap_or(i64::MAX),
        "maximumFileSize",
    )?;
    core_options.use_cache = options.use_cache.unwrap_or(true);
    core_options.save_also_as_json = options.save_also_as_json.unwrap_or(false);
    core_options.delete_outdated_cache = options.delete_outdated_cache.unwrap_or(true);
    if let Some(excluded_codecs) = options.excluded_codecs {
        core_options.excluded_codecs = comma_list(excluded_codecs);
    }
    core_options.black_pixel_threshold = bounded_u8(
        options.black_pixel_threshold.unwrap_or(32),
        0,
        128,
        "blackPixelThreshold",
    )?;
    core_options.black_bar_min_percentage = bounded_u8(
        options.black_bar_min_percentage.unwrap_or(90),
        50,
        100,
        "blackBarMinPercentage",
    )?;
    core_options.max_samples =
        bounded_usize(options.max_samples.unwrap_or(20), 5, 1000, "maxSamples")?;
    core_options.min_crop_size =
        bounded_u32(options.min_crop_size.unwrap_or(5), 1, 1000, "minCropSize")?;
    Ok(AsyncTask::new(VideoOptimizerScanTask {
        options: core_options,
        session: ScanSession::create(options.scan_id),
        thread_count: options.thread_count.unwrap_or(0) as usize,
    }))
}

impl Task for VideoOptimizerScanTask {
    type Output = core::VideoOptimizerScanResult;
    type JsValue = VideoOptimizerScanResult;

    fn compute(&mut self) -> Result<Self::Output> {
        core::initialize_threads(self.thread_count);
        run_controlled(&self.session, |control| {
            core::scan_video_optimizer_controlled(self.options.clone(), control)
        })
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(VideoOptimizerScanResult {
            entries: output
                .entries
                .into_iter()
                .map(|entry| {
                    let crop = entry.crop_rect;
                    VideoOptimizerEntry {
                        path: entry.path.to_string_lossy().into_owned(),
                        size: saturating_i64(entry.size),
                        modified_date: saturating_i64(entry.modified_date),
                        codec: entry.codec,
                        width: entry.width,
                        height: entry.height,
                        duration: entry.duration,
                        crop_left: crop.map(|value| value.left),
                        crop_top: crop.map(|value| value.top),
                        crop_right: crop.map(|value| value.right),
                        crop_bottom: crop.map(|value| value.bottom),
                    }
                })
                .collect(),
            messages: output.messages,
            stopped: output.stopped,
        })
    }
}

#[napi(object)]
pub struct VideoOptimizerCandidateOptions {
    pub source_path: String,
    pub mode: String,
    pub target_codec: String,
    pub quality: u32,
    pub fail_if_not_smaller: Option<bool>,
    pub limit_video_size: Option<bool>,
    pub maximum_width: Option<u32>,
    pub maximum_height: Option<u32>,
    pub noise_reduction: Option<String>,
    pub noise_reduction_strength: Option<u32>,
    pub crop_left: Option<u32>,
    pub crop_top: Option<u32>,
    pub crop_right: Option<u32>,
    pub crop_bottom: Option<u32>,
    pub crop_transcode: Option<bool>,
    pub current_codec: String,
    pub scan_id: Option<String>,
}

#[napi(object)]
pub struct VideoOptimizerCandidate {
    pub candidate_path: String,
    pub original_size: i64,
    pub candidate_size: i64,
}

pub struct VideoOptimizerCandidateTask {
    options: core::VideoOptimizerCandidateOptions,
    session: Option<ScanSession>,
}

#[napi]
pub fn create_video_optimizer_candidate(
    options: VideoOptimizerCandidateOptions,
) -> Result<AsyncTask<VideoOptimizerCandidateTask>> {
    let source = PathBuf::from(options.source_path);
    if !source.is_absolute() {
        return Err(Error::new(
            Status::InvalidArg,
            "sourcePath must be absolute",
        ));
    }
    let mode = mode(&options.mode)?;
    let crop = crop_rect(
        options.crop_left,
        options.crop_top,
        options.crop_right,
        options.crop_bottom,
    )?;
    if mode == core::VideoOptimizerMode::Crop && crop.is_none() {
        return Err(Error::new(
            Status::InvalidArg,
            "crop mode requires cropLeft, cropTop, cropRight, and cropBottom",
        ));
    }
    let quality = bounded_u32(options.quality, 0, 51, "quality")?;
    let maximum_width = bounded_u32(
        options.maximum_width.unwrap_or(1920),
        1,
        16_384,
        "maximumWidth",
    )?;
    let maximum_height = bounded_u32(
        options.maximum_height.unwrap_or(1080),
        1,
        16_384,
        "maximumHeight",
    )?;
    let noise_reduction_strength = bounded_u32(
        options.noise_reduction_strength.unwrap_or(5),
        1,
        10,
        "noiseReductionStrength",
    )?;
    Ok(AsyncTask::new(VideoOptimizerCandidateTask {
        options: core::VideoOptimizerCandidateOptions {
            source,
            mode,
            target_codec: codec(&options.target_codec)?,
            quality,
            fail_if_not_smaller: options.fail_if_not_smaller.unwrap_or(true),
            limit_video_size: options.limit_video_size.unwrap_or(false),
            maximum_width,
            maximum_height,
            noise_reduction: noise_reduction(options.noise_reduction.as_deref().unwrap_or("none"))?,
            noise_reduction_strength,
            crop_rect: crop,
            crop_mechanism: Default::default(),
            crop_transcode: options.crop_transcode.unwrap_or(false),
            current_codec: options.current_codec.trim().to_owned(),
        },
        session: ScanSession::create(options.scan_id),
    }))
}

impl Task for VideoOptimizerCandidateTask {
    type Output = core::VideoOptimizerCandidate;
    type JsValue = VideoOptimizerCandidate;

    fn compute(&mut self) -> Result<Self::Output> {
        run_controlled(&self.session, |control| {
            core::create_video_optimizer_candidate_controlled(self.options.clone(), control)
        })
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(VideoOptimizerCandidate {
            candidate_path: output.path.to_string_lossy().into_owned(),
            original_size: saturating_i64(output.original_size),
            candidate_size: saturating_i64(output.candidate_size),
        })
    }
}

fn mode(value: &str) -> Result<core::VideoOptimizerMode> {
    match value.trim() {
        "transcode" => Ok(core::VideoOptimizerMode::Transcode),
        "crop" => Ok(core::VideoOptimizerMode::Crop),
        _ => Err(Error::new(
            Status::InvalidArg,
            "mode must be transcode or crop",
        )),
    }
}

fn codec(value: &str) -> Result<core::VideoOptimizerCodec> {
    match value.trim().to_ascii_lowercase().as_str() {
        "h264" => Ok(core::VideoOptimizerCodec::H264),
        "h265" => Ok(core::VideoOptimizerCodec::H265),
        "av1" => Ok(core::VideoOptimizerCodec::Av1),
        "vp9" => Ok(core::VideoOptimizerCodec::Vp9),
        _ => Err(Error::new(
            Status::InvalidArg,
            "targetCodec must be h264, h265, av1, or vp9",
        )),
    }
}

fn noise_reduction(value: &str) -> Result<core::VideoOptimizerNoiseReduction> {
    match value.trim() {
        "none" => Ok(core::VideoOptimizerNoiseReduction::None),
        "hqdn3d" => Ok(core::VideoOptimizerNoiseReduction::Hqdn3d),
        _ => Err(Error::new(
            Status::InvalidArg,
            "noiseReduction must be none or hqdn3d",
        )),
    }
}

fn crop_rect(
    left: Option<u32>,
    top: Option<u32>,
    right: Option<u32>,
    bottom: Option<u32>,
) -> Result<Option<core::VideoOptimizerCropRect>> {
    match (left, top, right, bottom) {
        (None, None, None, None) => Ok(None),
        (Some(left), Some(top), Some(right), Some(bottom)) if left < right && top < bottom => {
            Ok(Some(core::VideoOptimizerCropRect {
                left,
                top,
                right,
                bottom,
            }))
        }
        _ => Err(Error::new(
            Status::InvalidArg,
            "crop rectangle must have left < right and top < bottom",
        )),
    }
}

fn paths(values: Option<Vec<String>>) -> Vec<PathBuf> {
    values
        .unwrap_or_default()
        .into_iter()
        .map(PathBuf::from)
        .collect()
}

fn comma_list(value: String) -> Vec<String> {
    value
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

fn non_negative_u64(value: i64, name: &str) -> Result<u64> {
    u64::try_from(value)
        .map_err(|_| Error::new(Status::InvalidArg, format!("{name} cannot be negative")))
}

fn bounded_u8(value: u32, minimum: u32, maximum: u32, name: &str) -> Result<u8> {
    if !(minimum..=maximum).contains(&value) {
        return Err(Error::new(
            Status::InvalidArg,
            format!("{name} must be {minimum}-{maximum}"),
        ));
    }
    Ok(value as u8)
}

fn bounded_u32(value: u32, minimum: u32, maximum: u32, name: &str) -> Result<u32> {
    if !(minimum..=maximum).contains(&value) {
        return Err(Error::new(
            Status::InvalidArg,
            format!("{name} must be {minimum}-{maximum}"),
        ));
    }
    Ok(value)
}

fn bounded_usize(value: u32, minimum: u32, maximum: u32, name: &str) -> Result<usize> {
    Ok(bounded_u32(value, minimum, maximum, name)? as usize)
}
