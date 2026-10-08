use czkawka_core::common::model::CheckingMethod;
use czkawka_core::tools::same_music::{
    MusicEntry, MusicSimilarity, SameMusic, SameMusicParameters,
};

use super::common::search_with_control;
use super::media::{configure_tool, result};
use crate::{
    CzkawkaError, MediaEntry, MediaGroup, MediaScanOptions, MediaScanResult, MusicCheckType,
    ScanControl,
};

pub(crate) fn scan(
    options: MediaScanOptions,
    control: &ScanControl,
) -> Result<MediaScanResult, CzkawkaError> {
    let mut similarity = MusicSimilarity::NONE;
    if options.music_compare_title {
        similarity |= MusicSimilarity::TRACK_TITLE;
    }
    if options.music_compare_artist {
        similarity |= MusicSimilarity::TRACK_ARTIST;
    }
    if options.music_compare_bitrate {
        similarity |= MusicSimilarity::BITRATE;
    }
    if options.music_compare_genre {
        similarity |= MusicSimilarity::GENRE;
    }
    if options.music_compare_year {
        similarity |= MusicSimilarity::YEAR;
    }
    if options.music_compare_length {
        similarity |= MusicSimilarity::LENGTH;
    }
    if similarity == MusicSimilarity::NONE {
        similarity = MusicSimilarity::TRACK_TITLE | MusicSimilarity::TRACK_ARTIST;
    }
    let check_method = match options.music_check_type {
        MusicCheckType::Tags => CheckingMethod::AudioTags,
        MusicCheckType::Fingerprint => CheckingMethod::AudioContent,
    };
    let mut tool = SameMusic::new(SameMusicParameters::new(
        similarity,
        options.music_approximate_comparison,
        check_method,
        options.music_minimum_fragment_duration,
        options.music_maximum_difference,
        options.music_compare_fingerprints_only_with_similar_titles,
    ));
    configure_tool(&mut tool, &options);
    search_with_control(&mut tool, control);
    let groups = if tool.get_use_reference() {
        tool.get_similar_music_referenced()
            .iter()
            .map(|(reference, others)| MediaGroup {
                entries: std::iter::once(media_entry(reference, true))
                    .chain(others.iter().map(|entry| media_entry(entry, false)))
                    .collect(),
            })
            .collect()
    } else {
        tool.get_duplicated_music_entries()
            .iter()
            .map(|group| MediaGroup {
                entries: group
                    .iter()
                    .map(|entry| media_entry(entry, false))
                    .collect(),
            })
            .collect()
    };
    Ok(result(&tool, groups))
}

fn media_entry(entry: &MusicEntry, is_reference: bool) -> MediaEntry {
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
        length: Some(entry.length.to_string()),
        genre: Some(entry.genre.clone()),
        bitrate: Some(entry.bitrate),
        is_reference,
        detail: Some(format!(
            "{} 路 {} 路 {} kbps",
            entry.year, entry.genre, entry.bitrate
        )),
        proper_extension: None,
    }
}
