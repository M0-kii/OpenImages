use image::DynamicImage;
use std::fs::File;
use std::io::BufReader;
use std::path::Path;

/// Longest edge of the proxy the preview renders against. Interactive edits run
/// on this, not the source, so slider drags stay responsive on a 50MP file.
pub const PROXY_MAX_EDGE: u32 = 1600;

pub fn load(path: &Path) -> Result<DynamicImage, String> {
    let img = image::open(path).map_err(|e| format!("could not decode {}: {e}", path.display()))?;
    Ok(apply_exif_orientation(img, read_orientation(path)))
}

pub fn make_proxy(src: &DynamicImage) -> DynamicImage {
    let (w, h) = (src.width(), src.height());
    if w.max(h) <= PROXY_MAX_EDGE {
        return src.clone();
    }
    src.resize(
        PROXY_MAX_EDGE,
        PROXY_MAX_EDGE,
        image::imageops::FilterType::Triangle,
    )
}

/// Missing or unreadable EXIF is normal (PNGs have none), so this never errors —
/// it just falls back to orientation 1, meaning "already upright".
fn read_orientation(path: &Path) -> u32 {
    let Ok(file) = File::open(path) else {
        return 1;
    };
    let mut reader = BufReader::new(file);
    let Ok(exif) = exif::Reader::new().read_from_container(&mut reader) else {
        return 1;
    };
    exif.get_field(exif::Tag::Orientation, exif::In::PRIMARY)
        .and_then(|f| f.value.get_uint(0))
        .unwrap_or(1)
}

/// Phone cameras store the sensor readout unrotated plus an orientation tag.
/// Bake it in on load so every downstream op sees the image the way a human
/// sees it — otherwise a crop rect drawn in the UI lands on the wrong pixels.
fn apply_exif_orientation(img: DynamicImage, orientation: u32) -> DynamicImage {
    match orientation {
        2 => img.fliph(),
        3 => img.rotate180(),
        4 => img.flipv(),
        5 => img.rotate90().fliph(),
        6 => img.rotate90(),
        7 => img.rotate270().fliph(),
        8 => img.rotate270(),
        _ => img,
    }
}
