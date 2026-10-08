use std::path::PathBuf;

use thiserror::Error;

mod capabilities;
mod scan_control;
#[cfg(test)]
mod tests;
mod upstream;

pub use capabilities::{API_VERSION, CAPABILITIES, CzkawkaInfo};
pub use scan_control::{ScanControl, ScanProgress};

pub fn initialize_threads(thread_count: usize) -> usize {
    upstream::common::initialize_threads(thread_count)
}

#[derive(Debug, Error)]
pub enum CzkawkaError {
    #[error("invalid option: {0}")]
    InvalidOption(String),
    #[error("operation failed: {0}")]
    Operation(String),
}

pub fn czkawka_info() -> CzkawkaInfo {
    capabilities::info(upstream::common::source_version())
}

#[derive(Debug, Clone, Copy, Default)]
pub enum DuplicateCheckMethod {
    Name,
    Size,
    SizeAndName,
    #[default]
    Hash,
}

#[derive(Debug, Clone, Copy, Default)]
pub enum DuplicateHashType {
    Crc32,
    Xxh3,
    #[default]
    Blake3,
}

#[derive(Debug, Clone)]
pub struct DuplicateScanOptions {
    pub included_directories: Vec<PathBuf>,
    pub reference_directories: Vec<PathBuf>,
    pub excluded_directories: Vec<PathBuf>,
    pub excluded_items: Vec<String>,
    pub allowed_extensions: String,
    pub excluded_extensions: String,
    pub minimum_file_size: u64,
    pub maximum_file_size: u64,
    pub recursive: bool,
    pub use_cache: bool,
    pub save_also_as_json: bool,
    pub delete_outdated_cache: bool,
    pub minimal_cache_file_size: u64,
    pub minimal_prehash_cache_file_size: u64,
    pub ignore_hard_links: bool,
    pub use_prehash: bool,
    pub case_sensitive_names: bool,
    pub check_method: DuplicateCheckMethod,
    pub hash_type: DuplicateHashType,
}

impl DuplicateScanOptions {
    pub fn new(included_directories: Vec<PathBuf>) -> Self {
        Self {
            included_directories,
            reference_directories: Vec::new(),
            excluded_directories: Vec::new(),
            excluded_items: Vec::new(),
            allowed_extensions: String::new(),
            excluded_extensions: String::new(),
            minimum_file_size: 1,
            maximum_file_size: u64::MAX,
            recursive: true,
            use_cache: false,
            save_also_as_json: false,
            delete_outdated_cache: true,
            minimal_cache_file_size: 256 * 1024,
            minimal_prehash_cache_file_size: 256 * 1024,
            ignore_hard_links: true,
            use_prehash: true,
            case_sensitive_names: false,
            check_method: DuplicateCheckMethod::Hash,
            hash_type: DuplicateHashType::Blake3,
        }
    }
}

#[derive(Debug, Clone)]
pub struct DuplicateFile {
    pub path: PathBuf,
    pub modified_date: u64,
    pub size: u64,
    pub hash: String,
    pub is_reference: bool,
}

#[derive(Debug, Clone)]
pub struct DuplicateGroup {
    pub files: Vec<DuplicateFile>,
}

#[derive(Debug, Clone)]
pub struct DuplicateScanResult {
    pub groups: Vec<DuplicateGroup>,
    pub messages: String,
    pub stopped: bool,
}

pub fn scan_duplicate_files(
    options: DuplicateScanOptions,
) -> Result<DuplicateScanResult, CzkawkaError> {
    scan_duplicate_files_controlled(options, &ScanControl::detached())
}

pub fn scan_duplicate_files_controlled(
    options: DuplicateScanOptions,
    control: &ScanControl,
) -> Result<DuplicateScanResult, CzkawkaError> {
    upstream::duplicate::scan_duplicate_files_controlled(options, control)
}

#[derive(Debug, Clone, Copy)]
pub enum BasicTool {
    BigFiles,
    EmptyFiles,
    EmptyFolders,
    TemporaryFiles,
    InvalidSymlinks,
    BadNames,
}

#[derive(Debug, Clone)]
pub struct BasicScanOptions {
    pub tool: BasicTool,
    pub included_directories: Vec<PathBuf>,
    pub reference_directories: Vec<PathBuf>,
    pub excluded_directories: Vec<PathBuf>,
    pub excluded_items: Vec<String>,
    pub allowed_extensions: String,
    pub excluded_extensions: String,
    pub recursive: bool,
    pub minimum_file_size: u64,
    pub maximum_file_size: u64,
    pub use_cache: bool,
    pub save_also_as_json: bool,
    pub delete_outdated_cache: bool,
    pub number_of_files: usize,
    pub biggest_first: bool,
    pub empty_files_search_zero_byte_content: bool,
    pub empty_files_search_non_printable_content: bool,
    pub temporary_file_extensions: Option<Vec<String>>,
}

impl BasicScanOptions {
    pub fn new(tool: BasicTool, included_directories: Vec<PathBuf>) -> Self {
        Self {
            tool,
            included_directories,
            reference_directories: Vec::new(),
            excluded_directories: Vec::new(),
            excluded_items: Vec::new(),
            allowed_extensions: String::new(),
            excluded_extensions: String::new(),
            recursive: true,
            minimum_file_size: 1,
            maximum_file_size: u64::MAX,
            use_cache: true,
            save_also_as_json: false,
            delete_outdated_cache: true,
            number_of_files: 50,
            biggest_first: true,
            empty_files_search_zero_byte_content: false,
            empty_files_search_non_printable_content: false,
            temporary_file_extensions: None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct BasicEntry {
    pub path: PathBuf,
    pub size: u64,
    pub modified_date: u64,
    pub secondary_path: Option<PathBuf>,
    pub detail: Option<String>,
}

#[derive(Debug, Clone)]
pub struct BasicScanResult {
    pub entries: Vec<BasicEntry>,
    pub messages: String,
    pub stopped: bool,
}

pub fn scan_basic_files(options: BasicScanOptions) -> Result<BasicScanResult, CzkawkaError> {
    upstream::basic::scan_basic_files(options)
}

pub fn scan_basic_files_controlled(
    options: BasicScanOptions,
    control: &ScanControl,
) -> Result<BasicScanResult, CzkawkaError> {
    upstream::basic::scan_basic_files_controlled(options, control)
}

#[derive(Debug, Clone)]
pub struct ExifScanOptions {
    pub included_directories: Vec<PathBuf>,
    pub reference_directories: Vec<PathBuf>,
    pub excluded_directories: Vec<PathBuf>,
    pub excluded_items: Vec<String>,
    pub allowed_extensions: String,
    pub excluded_extensions: String,
    pub recursive: bool,
    pub minimum_file_size: u64,
    pub maximum_file_size: u64,
    pub use_cache: bool,
    pub save_also_as_json: bool,
    pub delete_outdated_cache: bool,
    pub ignored_tags: Vec<String>,
}

impl ExifScanOptions {
    pub fn new(included_directories: Vec<PathBuf>) -> Self {
        Self {
            included_directories,
            reference_directories: Vec::new(),
            excluded_directories: Vec::new(),
            excluded_items: Vec::new(),
            allowed_extensions: String::new(),
            excluded_extensions: String::new(),
            recursive: true,
            minimum_file_size: 1,
            maximum_file_size: u64::MAX,
            use_cache: true,
            save_also_as_json: false,
            delete_outdated_cache: true,
            ignored_tags: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExifTag {
    pub name: String,
    pub code: u16,
    pub group: String,
}

#[derive(Debug, Clone)]
pub struct ExifEntry {
    pub path: PathBuf,
    pub size: u64,
    pub modified_date: u64,
    pub tags: Vec<ExifTag>,
}

#[derive(Debug, Clone)]
pub struct ExifScanResult {
    pub entries: Vec<ExifEntry>,
    pub messages: String,
    pub stopped: bool,
}

#[derive(Debug, Clone)]
pub struct ExifCandidate {
    pub path: PathBuf,
    pub removed_tags: u32,
}

pub fn scan_exif_files(options: ExifScanOptions) -> Result<ExifScanResult, CzkawkaError> {
    scan_exif_files_controlled(options, &ScanControl::detached())
}

pub fn scan_exif_files_controlled(
    options: ExifScanOptions,
    control: &ScanControl,
) -> Result<ExifScanResult, CzkawkaError> {
    upstream::exif_remover::scan(options, control)
}

pub fn create_exif_candidate(
    source: PathBuf,
    tags: Vec<ExifTag>,
) -> Result<ExifCandidate, CzkawkaError> {
    upstream::exif_remover::create_candidate(source, tags)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum VideoOptimizerMode {
    #[default]
    Transcode,
    Crop,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum VideoOptimizerCodec {
    H264,
    #[default]
    H265,
    Av1,
    Vp9,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum VideoOptimizerNoiseReduction {
    #[default]
    None,
    Hqdn3d,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum VideoOptimizerCropMechanism {
    #[default]
    BlackBars,
    StaticContent,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct VideoOptimizerCropRect {
    pub left: u32,
    pub top: u32,
    pub right: u32,
    pub bottom: u32,
}

#[derive(Debug, Clone)]
pub struct VideoOptimizerScanOptions {
    pub mode: VideoOptimizerMode,
    pub included_directories: Vec<PathBuf>,
    pub reference_directories: Vec<PathBuf>,
    pub excluded_directories: Vec<PathBuf>,
    pub excluded_items: Vec<String>,
    pub allowed_extensions: String,
    pub excluded_extensions: String,
    pub recursive: bool,
    pub minimum_file_size: u64,
    pub maximum_file_size: u64,
    pub use_cache: bool,
    pub save_also_as_json: bool,
    pub delete_outdated_cache: bool,
    pub excluded_codecs: Vec<String>,
    pub black_pixel_threshold: u8,
    pub black_bar_min_percentage: u8,
    pub max_samples: usize,
    pub min_crop_size: u32,
}

impl VideoOptimizerScanOptions {
    pub fn new(mode: VideoOptimizerMode, included_directories: Vec<PathBuf>) -> Self {
        Self {
            mode,
            included_directories,
            reference_directories: Vec::new(),
            excluded_directories: Vec::new(),
            excluded_items: Vec::new(),
            allowed_extensions: String::new(),
            excluded_extensions: String::new(),
            recursive: true,
            minimum_file_size: 1,
            maximum_file_size: u64::MAX,
            use_cache: true,
            save_also_as_json: false,
            delete_outdated_cache: true,
            excluded_codecs: vec!["hevc".into(), "h265".into(), "av1".into(), "vp9".into()],
            black_pixel_threshold: 32,
            black_bar_min_percentage: 90,
            max_samples: 20,
            min_crop_size: 5,
        }
    }
}

#[derive(Debug, Clone)]
pub struct VideoOptimizerEntry {
    pub path: PathBuf,
    pub size: u64,
    pub modified_date: u64,
    pub codec: String,
    pub width: u32,
    pub height: u32,
    pub duration: f64,
    pub crop_rect: Option<VideoOptimizerCropRect>,
}

#[derive(Debug, Clone)]
pub struct VideoOptimizerScanResult {
    pub entries: Vec<VideoOptimizerEntry>,
    pub messages: String,
    pub stopped: bool,
}

#[derive(Debug, Clone)]
pub struct VideoOptimizerCandidateOptions {
    pub source: PathBuf,
    pub mode: VideoOptimizerMode,
    pub target_codec: VideoOptimizerCodec,
    pub quality: u32,
    pub fail_if_not_smaller: bool,
    pub limit_video_size: bool,
    pub maximum_width: u32,
    pub maximum_height: u32,
    pub noise_reduction: VideoOptimizerNoiseReduction,
    pub noise_reduction_strength: u32,
    pub crop_rect: Option<VideoOptimizerCropRect>,
    pub crop_mechanism: VideoOptimizerCropMechanism,
    pub crop_transcode: bool,
    pub current_codec: String,
}

#[derive(Debug, Clone)]
pub struct VideoOptimizerCandidate {
    pub path: PathBuf,
    pub original_size: u64,
    pub candidate_size: u64,
}

pub fn scan_video_optimizer(
    options: VideoOptimizerScanOptions,
) -> Result<VideoOptimizerScanResult, CzkawkaError> {
    scan_video_optimizer_controlled(options, &ScanControl::detached())
}

pub fn scan_video_optimizer_controlled(
    options: VideoOptimizerScanOptions,
    control: &ScanControl,
) -> Result<VideoOptimizerScanResult, CzkawkaError> {
    upstream::video_optimizer::scan(options, control)
}

pub fn create_video_optimizer_candidate(
    options: VideoOptimizerCandidateOptions,
) -> Result<VideoOptimizerCandidate, CzkawkaError> {
    upstream::video_optimizer::create_candidate(options, &ScanControl::detached())
}

pub fn create_video_optimizer_candidate_controlled(
    options: VideoOptimizerCandidateOptions,
    control: &ScanControl,
) -> Result<VideoOptimizerCandidate, CzkawkaError> {
    upstream::video_optimizer::create_candidate(options, control)
}

#[derive(Debug, Clone, Copy)]
pub enum MediaTool {
    SimilarImages,
    SimilarVideos,
    DuplicateMusic,
    BrokenFiles,
    BadExtensions,
}

#[derive(Debug, Clone, Copy, Default)]
pub enum ImageHashAlgorithm {
    #[default]
    Mean,
    Gradient,
    Blockhash,
    VertGradient,
    DoubleGradient,
    Median,
}

#[derive(Debug, Clone, Copy, Default)]
pub enum ImageResizeAlgorithm {
    #[default]
    Lanczos3,
    Gaussian,
    CatmullRom,
    Triangle,
    Nearest,
}

#[derive(Debug, Clone, Copy, Default)]
pub enum ImageGeometricInvariance {
    #[default]
    Off,
    MirrorFlip,
    MirrorFlipRotate90,
}

#[derive(Debug, Clone, Copy, Default)]
pub enum VideoCropDetect {
    #[default]
    Letterbox,
    Motion,
    None,
}

#[derive(Debug, Clone, Copy, Default)]
pub enum MusicCheckType {
    #[default]
    Tags,
    Fingerprint,
}

#[derive(Debug, Clone)]
pub struct MediaScanOptions {
    pub tool: MediaTool,
    pub included_directories: Vec<PathBuf>,
    pub reference_directories: Vec<PathBuf>,
    pub excluded_directories: Vec<PathBuf>,
    pub excluded_items: Vec<String>,
    pub allowed_extensions: String,
    pub excluded_extensions: String,
    pub recursive: bool,
    pub minimum_file_size: u64,
    pub maximum_file_size: u64,
    pub use_cache: bool,
    pub save_also_as_json: bool,
    pub delete_outdated_cache: bool,
    pub ignore_hard_links: bool,
    pub similarity: u32,
    pub image_hash_size: u8,
    pub image_hash_algorithm: ImageHashAlgorithm,
    pub image_resize_algorithm: ImageResizeAlgorithm,
    pub image_ignore_same_size: bool,
    pub image_ignore_same_resolution: bool,
    pub image_geometric_invariance: ImageGeometricInvariance,
    pub video_ignore_same_size: bool,
    pub video_ignore_same_resolution: bool,
    pub video_skip_forward: u32,
    pub video_hash_duration: u32,
    pub video_crop_detect: VideoCropDetect,
    pub video_window_count: u32,
    pub video_duration_tolerance_pct: f64,
    pub video_min_matching_windows: f64,
    pub video_subclip_min_match: f64,
    pub video_check_audio_content: bool,
    pub music_check_type: MusicCheckType,
    pub music_approximate_comparison: bool,
    pub music_compare_title: bool,
    pub music_compare_artist: bool,
    pub music_compare_bitrate: bool,
    pub music_compare_genre: bool,
    pub music_compare_year: bool,
    pub music_compare_length: bool,
    pub music_maximum_difference: f64,
    pub music_minimum_fragment_duration: f32,
    pub music_compare_fingerprints_only_with_similar_titles: bool,
    pub broken_audio: bool,
    pub broken_pdf: bool,
    pub broken_archive: bool,
    pub broken_image: bool,
    pub broken_video_ffprobe: bool,
    pub broken_video_ffmpeg: bool,
    pub broken_font: bool,
    pub broken_markup: bool,
}

impl MediaScanOptions {
    pub fn new(tool: MediaTool, included_directories: Vec<PathBuf>) -> Self {
        Self {
            tool,
            included_directories,
            reference_directories: Vec::new(),
            excluded_directories: Vec::new(),
            excluded_items: Vec::new(),
            allowed_extensions: String::new(),
            excluded_extensions: String::new(),
            recursive: true,
            minimum_file_size: 1,
            maximum_file_size: u64::MAX,
            use_cache: true,
            save_also_as_json: false,
            delete_outdated_cache: true,
            ignore_hard_links: true,
            similarity: 10,
            image_hash_size: 16,
            image_hash_algorithm: ImageHashAlgorithm::Mean,
            image_resize_algorithm: ImageResizeAlgorithm::Lanczos3,
            image_ignore_same_size: false,
            image_ignore_same_resolution: false,
            image_geometric_invariance: ImageGeometricInvariance::Off,
            video_ignore_same_size: false,
            video_ignore_same_resolution: false,
            video_skip_forward: 15,
            video_hash_duration: 10,
            video_crop_detect: VideoCropDetect::Letterbox,
            video_window_count: 5,
            video_duration_tolerance_pct: 20.0,
            video_min_matching_windows: 0.6,
            video_subclip_min_match: 0.5,
            video_check_audio_content: false,
            music_check_type: MusicCheckType::Tags,
            music_approximate_comparison: true,
            music_compare_title: true,
            music_compare_artist: true,
            music_compare_bitrate: false,
            music_compare_genre: false,
            music_compare_year: false,
            music_compare_length: false,
            music_maximum_difference: 10.0,
            music_minimum_fragment_duration: 15.0,
            music_compare_fingerprints_only_with_similar_titles: true,
            broken_audio: true,
            broken_pdf: true,
            broken_archive: true,
            broken_image: true,
            broken_video_ffprobe: false,
            broken_video_ffmpeg: false,
            broken_font: false,
            broken_markup: false,
        }
    }
}

#[derive(Debug, Clone)]
pub struct MediaEntry {
    pub path: PathBuf,
    pub size: u64,
    pub modified_date: u64,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub fps: Option<f64>,
    pub codec: Option<String>,
    pub similarity: Option<String>,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub year: Option<String>,
    pub length: Option<String>,
    pub genre: Option<String>,
    pub bitrate: Option<u32>,
    pub is_reference: bool,
    pub detail: Option<String>,
    pub proper_extension: Option<String>,
}

#[derive(Debug, Clone)]
pub struct MediaGroup {
    pub entries: Vec<MediaEntry>,
}

#[derive(Debug, Clone)]
pub struct MediaScanResult {
    pub groups: Vec<MediaGroup>,
    pub messages: String,
    pub stopped: bool,
}

pub fn scan_media_files(options: MediaScanOptions) -> Result<MediaScanResult, CzkawkaError> {
    scan_media_files_controlled(options, &ScanControl::detached())
}

pub fn scan_media_files_controlled(
    options: MediaScanOptions,
    control: &ScanControl,
) -> Result<MediaScanResult, CzkawkaError> {
    upstream::media::scan_media_files_controlled(options, control)
}

#[cfg(any())]
fn music_media_entry(entry: &MusicEntry, is_reference: bool) -> MediaEntry {
    MediaEntry {
        path: entry.path.clone(),
        size: entry.size,
        modified_date: entry.modified_date,
        width: None,
        height: None,
        fps: None,
        codec: None,
        similarity: None,
        title: Some(entry.track_title.clone()),
        artist: Some(entry.track_artist.clone()),
        year: Some(entry.year.clone()),
        length: Some(entry.length.clone()),
        genre: Some(entry.genre.clone()),
        bitrate: Some(entry.bitrate),
        is_reference,
        detail: Some(format!(
            "{} · {} · {} kbps",
            entry.year, entry.genre, entry.bitrate
        )),
        proper_extension: None,
    }
}

#[cfg(any())]
fn configure_media_tool<T: CommonData>(tool: &mut T, options: &MediaScanOptions) {
    tool.set_included_directory(options.included_directories.clone());
    if !options.reference_directories.is_empty() {
        tool.set_reference_directory(options.reference_directories.clone());
    }
    tool.set_excluded_directory(options.excluded_directories.clone());
    tool.set_excluded_items(options.excluded_items.clone());
    tool.set_allowed_extensions(options.allowed_extensions.clone());
    tool.set_excluded_extensions(options.excluded_extensions.clone());
    tool.set_recursive_search(options.recursive);
    tool.set_minimal_file_size(options.minimum_file_size);
    tool.set_maximal_file_size(options.maximum_file_size);
    tool.set_use_cache(options.use_cache);
    tool.set_save_also_as_json(options.save_also_as_json);
    tool.set_delete_outdated_cache(options.delete_outdated_cache);
}

#[cfg(any())]
pub(crate) fn initialize_cache_path() {
    static INITIALIZE_CACHE_PATH: Once = Once::new();
    INITIALIZE_CACHE_PATH.call_once(|| {
        let _ = set_config_cache_path("xiranite", "xiranite");
    });
}

#[cfg(any())]
fn media_result<T: CommonData>(tool: &T, groups: Vec<MediaGroup>) -> MediaScanResult {
    MediaScanResult {
        groups,
        messages: tool.get_text_messages().create_messages_text(),
        stopped: tool.get_stopped_search(),
    }
}
