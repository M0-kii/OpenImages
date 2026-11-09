use crate::favicon::{self, FaviconSet};
use crate::loader;
use crate::pipeline::{apply_all, apply_all_tracked, output_dims, Color, Operation};

use base64::Engine;
use image::{DynamicImage, ImageEncoder, ImageFormat};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufWriter, Cursor, ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

pub struct Doc {
    source: DynamicImage,
    proxy: DynamicImage,
}

impl Doc {
    fn full_dims(&self) -> (u32, u32) {
        (self.source.width(), self.source.height())
    }
}

#[derive(Default)]
pub struct AppState {
    docs: Mutex<HashMap<u64, Doc>>,
    next_id: AtomicU64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocMeta {
    pub id: u64,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub has_alpha: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum OutputFormat {
    Png,
    Jpeg,
    WebP,
    Bmp,
    Tiff,
    Ico,
}

impl OutputFormat {
    fn to_image_format(self) -> ImageFormat {
        match self {
            Self::Png => ImageFormat::Png,
            Self::Jpeg => ImageFormat::Jpeg,
            Self::WebP => ImageFormat::WebP,
            Self::Bmp => ImageFormat::Bmp,
            Self::Tiff => ImageFormat::Tiff,
            Self::Ico => ImageFormat::Ico,
        }
    }

    const ALL: [Self; 6] = [
        Self::Png,
        Self::Jpeg,
        Self::WebP,
        Self::Bmp,
        Self::Tiff,
        Self::Ico,
    ];
}

/// Which formats this build of `image` can actually encode. The UI populates its
/// dropdown from this rather than hardcoding a list that might quietly be wrong.
#[tauri::command]
pub fn supported_formats() -> Vec<OutputFormat> {
    OutputFormat::ALL
        .into_iter()
        .filter(|f| f.to_image_format().writing_enabled())
        .collect()
}

#[tauri::command]
pub fn open_image(state: tauri::State<AppState>, path: String) -> Result<DocMeta, String> {
    let path = PathBuf::from(path);
    let source = loader::load(&path)?;
    let proxy = loader::make_proxy(&source);

    let meta = DocMeta {
        id: state.next_id.fetch_add(1, Ordering::Relaxed),
        name: path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "untitled".into()),
        width: source.width(),
        height: source.height(),
        has_alpha: source.color().has_alpha(),
    };

    state
        .docs
        .lock()
        .unwrap()
        .insert(meta.id, Doc { source, proxy });
    Ok(meta)
}

#[tauri::command]
pub fn close_image(state: tauri::State<AppState>, id: u64) {
    state.docs.lock().unwrap().remove(&id);
}

/// Returns raw PNG bytes, not a base64 data URL — Tauri v2 hands `Vec<u8>` to the
/// webview as an ArrayBuffer, which skips the ~33% base64 tax on every keystroke
/// of a slider drag.
#[tauri::command]
pub fn render_preview(
    state: tauri::State<AppState>,
    id: u64,
    ops: Vec<Operation>,
) -> Result<tauri::ipc::Response, String> {
    let docs = state.docs.lock().unwrap();
    let doc = docs.get(&id).ok_or("no such image")?;
    // Pixel-unit ops shrink with the proxy; ratios pass through unchanged.
    let out = apply_all_tracked(doc.proxy.clone(), &ops, doc.full_dims());
    drop(docs);

    let rgba = out.to_rgba8();
    let mut buf = Vec::new();
    image::codecs::png::PngEncoder::new(Cursor::new(&mut buf))
        .write_image(
            rgba.as_raw(),
            rgba.width(),
            rgba.height(),
            image::ExtendedColorType::Rgba8,
        )
        .map_err(|e| e.to_string())?;

    Ok(tauri::ipc::Response::new(buf))
}

/// Dimensions the current pipeline would produce at full resolution. Pure
/// geometry — it never touches a pixel, so it's free to call on every keystroke.
#[tauri::command]
pub fn output_size(
    state: tauri::State<AppState>,
    id: u64,
    ops: Vec<Operation>,
) -> Result<(u32, u32), String> {
    let docs = state.docs.lock().unwrap();
    let doc = docs.get(&id).ok_or("no such image")?;
    Ok(output_dims(&ops, doc.full_dims()))
}

#[tauri::command]
pub fn export_image(
    state: tauri::State<AppState>,
    id: u64,
    ops: Vec<Operation>,
    path: String,
    format: OutputFormat,
    quality: u8,
    matte: Color,
) -> Result<(), String> {
    let docs = state.docs.lock().unwrap();
    let doc = docs.get(&id).ok_or("no such image")?;
    let out = apply_all(doc.source.clone(), &ops);
    drop(docs);

    encode_to_path(&out, Path::new(&path), format, quality, matte)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchResult {
    pub name: String,
    pub ok: bool,
    pub message: String,
}

/// Apply the current pipeline to a list of files. Crop and other ratio-based ops
/// are resolution-independent, so a pipeline built on one image is meaningful on
/// a folder of differently sized ones.
///
/// One bad file must not abort the run, so every path reports its own outcome.
#[tauri::command]
pub fn batch_export(
    ops: Vec<Operation>,
    paths: Vec<String>,
    out_dir: String,
    format: OutputFormat,
    quality: u8,
    matte: Color,
    suffix: String,
) -> Result<Vec<BatchResult>, String> {
    let dir = PathBuf::from(&out_dir);
    std::fs::create_dir_all(&dir).map_err(|e| format!("creating {out_dir}: {e}"))?;

    let ext = format!("{format:?}").to_lowercase();

    Ok(paths
        .into_iter()
        .map(|p| {
            let src = PathBuf::from(&p);
            let name = src
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| p.clone());

            let run = || -> Result<PathBuf, String> {
                let img = loader::load(&src)?;
                let out = apply_all(img, &ops);

                let stem = src
                    .file_stem()
                    .map(|s| s.to_string_lossy().into_owned())
                    .unwrap_or_else(|| "image".into());
                let dest = dir.join(format!("{stem}{suffix}.{ext}"));

                let file = std::fs::File::create_new(&dest).map_err(|error| {
                    if error.kind() == ErrorKind::AlreadyExists {
                        format!("output would overwrite an existing file: {}", dest.display())
                    } else {
                        format!("creating {}: {error}", dest.display())
                    }
                })?;
                let written = {
                    let mut writer = BufWriter::new(file);
                    encode_to_writer(&out, &mut writer, format, quality, matte)
                        .and_then(|()| writer.flush().map_err(|error| error.to_string()))
                };
                if let Err(error) = written {
                    std::fs::remove_file(&dest).map_err(|cleanup| {
                        format!("{error}. Could not remove incomplete output {}: {cleanup}", dest.display())
                    })?;
                    return Err(error);
                }
                Ok(dest)
            };

            match run() {
                Ok(dest) => BatchResult {
                    name,
                    ok: true,
                    message: dest.file_name().unwrap_or_default().to_string_lossy().into_owned(),
                },
                Err(e) => BatchResult { name, ok: false, message: e },
            }
        })
        .collect())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Swatch {
    pub hex: String,
    /// Share of sampled pixels, 0..1.
    pub weight: f32,
}

/// Dominant colors, by bucketing rather than k-means: quantize to a coarse grid,
/// count, then report each bucket's true mean. Fast, deterministic, and good
/// enough to pull a palette off a screenshot or logo.
#[tauri::command]
pub fn extract_palette(
    state: tauri::State<AppState>,
    id: u64,
    ops: Vec<Operation>,
    count: usize,
) -> Result<Vec<Swatch>, String> {
    let docs = state.docs.lock().unwrap();
    let doc = docs.get(&id).ok_or("no such image")?;
    let out = apply_all_tracked(doc.proxy.clone(), &ops, doc.full_dims());
    drop(docs);

    // 160px is plenty to characterize a palette and keeps this interactive.
    let small = out.resize(160, 160, image::imageops::FilterType::Triangle);
    let rgba = small.to_rgba8();

    // 5 bits per channel: fine enough to keep distinct brand colors apart,
    // coarse enough that antialiasing noise collapses into its parent color.
    const SHIFT: u8 = 3;
    let mut buckets: HashMap<(u8, u8, u8), (u64, u64, u64, u64)> = HashMap::new();

    for px in rgba.pixels() {
        // Near-transparent pixels have meaningless color.
        if px[3] < 16 {
            continue;
        }
        let key = (px[0] >> SHIFT, px[1] >> SHIFT, px[2] >> SHIFT);
        let e = buckets.entry(key).or_default();
        e.0 += px[0] as u64;
        e.1 += px[1] as u64;
        e.2 += px[2] as u64;
        e.3 += 1;
    }

    if buckets.is_empty() {
        return Ok(Vec::new());
    }
    let total: u64 = buckets.values().map(|b| b.3).sum();

    let mut ranked: Vec<_> = buckets.into_values().collect();
    // Sort by population, then by color, so ties don't reorder between runs —
    // HashMap iteration order is not stable.
    ranked.sort_by(|a, b| b.3.cmp(&a.3).then_with(|| (a.0, a.1, a.2).cmp(&(b.0, b.1, b.2))));

    Ok(ranked
        .into_iter()
        .take(count.clamp(1, 32))
        .map(|(r, g, b, n)| Swatch {
            hex: format!("#{:02X}{:02X}{:02X}", (r / n) as u8, (g / n) as u8, (b / n) as u8),
            weight: n as f32 / total as f32,
        })
        .collect())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataUri {
    pub uri: String,
    pub bytes: usize,
}

/// Encode the edited image as a `data:` URI for pasting into CSS or HTML.
#[tauri::command]
pub fn data_uri(
    state: tauri::State<AppState>,
    id: u64,
    ops: Vec<Operation>,
    format: OutputFormat,
    quality: u8,
    max_edge: u32,
    matte: Color,
) -> Result<DataUri, String> {
    let docs = state.docs.lock().unwrap();
    let doc = docs.get(&id).ok_or("no such image")?;
    let mut out = apply_all(doc.source.clone(), &ops);
    drop(docs);

    // Data URIs are inlined into source files; a full-res one is never what the
    // caller wants. Cap the longest edge, defaulting to something CSS-sized.
    let cap = max_edge.clamp(16, 4096);
    if out.width().max(out.height()) > cap {
        out = out.resize(cap, cap, image::imageops::FilterType::Lanczos3);
    }

    let mut buf = Vec::new();
    encode_to_writer(&out, &mut Cursor::new(&mut buf), format, quality, matte)?;

    let mime = match format {
        OutputFormat::Png => "image/png",
        OutputFormat::Jpeg => "image/jpeg",
        OutputFormat::WebP => "image/webp",
        OutputFormat::Bmp => "image/bmp",
        OutputFormat::Tiff => "image/tiff",
        OutputFormat::Ico => "image/x-icon",
    };
    let b64 = base64::engine::general_purpose::STANDARD.encode(&buf);

    Ok(DataUri {
        bytes: buf.len(),
        uri: format!("data:{mime};base64,{b64}"),
    })
}

#[tauri::command]
pub fn export_favicon(
    state: tauri::State<AppState>,
    id: u64,
    ops: Vec<Operation>,
    dir: String,
) -> Result<Vec<String>, String> {
    let docs = state.docs.lock().unwrap();
    let doc = docs.get(&id).ok_or("no such image")?;
    let out = apply_all(doc.source.clone(), &ops);
    drop(docs);

    favicon::generate(&out, Path::new(&dir), &FaviconSet::default())
}

fn encode_to_path(
    img: &DynamicImage,
    path: &Path,
    format: OutputFormat,
    quality: u8,
    matte: Color,
) -> Result<(), String> {
    let file = std::fs::File::create(path).map_err(|e| format!("creating {}: {e}", path.display()))?;
    let mut writer = std::io::BufWriter::new(file);
    encode_to_writer(img, &mut writer, format, quality, matte)
}

/// Composite onto an opaque background.
///
/// `DynamicImage::to_rgb8` does *not* do this — it discards the alpha channel and
/// keeps whatever RGB was underneath. Encoding a circle-cropped image straight to
/// JPEG that way silently returns the original uncropped square, because the
/// masked pixels still carry their original color behind a zeroed alpha.
fn flatten_onto(img: &DynamicImage, matte: Color) -> image::RgbImage {
    let src = img.to_rgba8();
    let mut out = image::RgbImage::new(src.width(), src.height());

    for (x, y, px) in src.enumerate_pixels() {
        let a = px[3] as f32 / 255.0;
        let mix = |fg: u8, bg: u8| (fg as f32 * a + bg as f32 * (1.0 - a)).round() as u8;
        out.put_pixel(
            x,
            y,
            image::Rgb([
                mix(px[0], matte.r),
                mix(px[1], matte.g),
                mix(px[2], matte.b),
            ]),
        );
    }
    out
}

fn encode_to_writer<W: std::io::Write + std::io::Seek>(
    img: &DynamicImage,
    writer: &mut W,
    format: OutputFormat,
    quality: u8,
    matte: Color,
) -> Result<(), String> {
    if format == OutputFormat::Ico && (img.width() > 256 || img.height() > 256) {
        return Err(format!(
            "ICO caps out at 256x256, but this image is {}x{}. Resize it first, \
             or use the Favicon Set tool to get a proper multi-size icon.",
            img.width(),
            img.height()
        ));
    }

    match format {
        // JPEG has no alpha channel, and its encoder needs the quality knob, so
        // it can't go through the generic `write_to` path.
        OutputFormat::Jpeg => {
            let rgb = flatten_onto(img, matte);
            image::codecs::jpeg::JpegEncoder::new_with_quality(writer, quality.clamp(1, 100))
                .write_image(
                    rgb.as_raw(),
                    rgb.width(),
                    rgb.height(),
                    image::ExtendedColorType::Rgb8,
                )
                .map_err(|e| e.to_string())
        }
        other => img
            .write_to(writer, other.to_image_format())
            .map_err(|e| e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pipeline::ResampleFilter;
    use image::{GenericImageView, Rgba, RgbaImage};

    const WHITE: Color = Color { r: 255, g: 255, b: 255, a: 255 };

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join("openimages_cmd_test");
        std::fs::create_dir_all(&dir).unwrap();
        dir.join(name)
    }

    fn sample() -> DynamicImage {
        let mut buf = RgbaImage::new(120, 80);
        for (x, y, px) in buf.enumerate_pixels_mut() {
            *px = Rgba([(x * 2) as u8, (y * 3) as u8, 90, 255]);
        }
        DynamicImage::ImageRgba8(buf)
    }

    /// Encode into every format the UI will offer, then decode it back. Catches
    /// the case where a format is advertised as writable but blows up in practice.
    #[test]
    fn every_advertised_format_round_trips() {
        let img = sample();
        for fmt in supported_formats() {
            // ICO's 256px ceiling is enforced separately; scale down for this pass.
            let subject = if fmt == OutputFormat::Ico {
                img.resize_exact(64, 64, image::imageops::FilterType::Nearest)
            } else {
                img.clone()
            };

            let ext = format!("{fmt:?}").to_lowercase();
            let path = scratch(&format!("rt.{ext}"));
            encode_to_path(&subject, &path, fmt, 90, WHITE)
                .unwrap_or_else(|e| panic!("{fmt:?} failed to encode: {e}"));

            let decoded = image::open(&path)
                .unwrap_or_else(|e| panic!("{fmt:?} wrote a file we cannot read back: {e}"));
            assert_eq!(
                decoded.dimensions(),
                subject.dimensions(),
                "{fmt:?} changed dimensions"
            );
            std::fs::remove_file(&path).ok();
        }
    }

    /// Regression: `to_rgb8` discards alpha without compositing, so a masked
    /// pixel would export carrying whatever color hid behind the zeroed alpha —
    /// a circle-cropped image would come back as the original square.
    #[test]
    fn jpeg_composites_transparency_onto_the_matte() {
        let mut buf = RgbaImage::new(3, 1);
        buf.put_pixel(0, 0, Rgba([220, 30, 30, 255])); // opaque
        buf.put_pixel(1, 0, Rgba([220, 30, 30, 0])); // masked away
        buf.put_pixel(2, 0, Rgba([220, 30, 30, 128])); // half

        let rgb = flatten_onto(&DynamicImage::ImageRgba8(buf), WHITE);
        assert_eq!(rgb.get_pixel(0, 0).0, [220, 30, 30], "opaque pixel untouched");
        assert_eq!(rgb.get_pixel(1, 0).0, [255, 255, 255], "masked pixel becomes matte");

        let half = rgb.get_pixel(2, 0).0;
        assert!(half[0] > 230 && half[1] > 130 && half[1] < 160, "half-alpha lands between: {half:?}");
    }

    #[test]
    fn matte_color_is_honored() {
        let mut buf = RgbaImage::new(1, 1);
        buf.put_pixel(0, 0, Rgba([9, 9, 9, 0]));
        let black = Color { r: 0, g: 0, b: 0, a: 255 };
        let rgb = flatten_onto(&DynamicImage::ImageRgba8(buf), black);
        assert_eq!(rgb.get_pixel(0, 0).0, [0, 0, 0]);
    }

    #[test]
    fn jpeg_export_of_a_fully_transparent_image_is_readable() {
        let mut buf = RgbaImage::new(8, 8);
        for px in buf.pixels_mut() {
            *px = Rgba([10, 200, 30, 0]);
        }
        let path = scratch("alpha.jpeg");
        encode_to_path(&DynamicImage::ImageRgba8(buf), &path, OutputFormat::Jpeg, 80, WHITE).unwrap();

        let decoded = image::open(&path).expect("should decode");
        // Every pixel was masked, so the whole file is matte.
        assert!(decoded.to_rgb8().pixels().all(|p| p.0[0] > 245));
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn oversized_ico_export_explains_itself() {
        let big = DynamicImage::ImageRgba8(RgbaImage::new(300, 300));
        let err = encode_to_path(&big, &scratch("big.ico"), OutputFormat::Ico, 90, WHITE)
            .expect_err("300px ICO exceeds the format's 256px ceiling");
        assert!(err.contains("256"), "error should name the limit: {err}");
        assert!(err.contains("Favicon"), "error should point at the alternative: {err}");
    }

    #[test]
    fn ico_export_at_the_256px_boundary_is_allowed() {
        let edge = DynamicImage::ImageRgba8(RgbaImage::new(256, 256));
        let path = scratch("edge.ico");
        encode_to_path(&edge, &path, OutputFormat::Ico, 90, WHITE).expect("256x256 is exactly legal");
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn jpeg_quality_actually_changes_file_size() {
        let img = sample();
        let lo = scratch("q10.jpeg");
        let hi = scratch("q95.jpeg");
        encode_to_path(&img, &lo, OutputFormat::Jpeg, 10, WHITE).unwrap();
        encode_to_path(&img, &hi, OutputFormat::Jpeg, 95, WHITE).unwrap();

        let (lo_len, hi_len) = (
            std::fs::metadata(&lo).unwrap().len(),
            std::fs::metadata(&hi).unwrap().len(),
        );
        assert!(lo_len < hi_len, "q10 ({lo_len}B) should be smaller than q95 ({hi_len}B)");
        std::fs::remove_file(&lo).ok();
        std::fs::remove_file(&hi).ok();
    }

    /// The proxy exists so previews are cheap; a resize op must still produce the
    /// same output dimensions whether it ran on the source or the proxy.
    #[test]
    fn resize_output_is_independent_of_proxy_scale() {
        let big = DynamicImage::ImageRgba8(RgbaImage::new(4000, 2000));
        let proxy = crate::loader::make_proxy(&big);
        assert!(proxy.width() <= crate::loader::PROXY_MAX_EDGE);

        let ops = vec![crate::pipeline::Operation::Resize {
            width: 300,
            height: 150,
            filter: ResampleFilter::Triangle,
        }];
        assert_eq!(apply_all(big, &ops).dimensions(), (300, 150));
        assert_eq!(apply_all(proxy, &ops).dimensions(), (300, 150));
    }

    #[test]
    fn loading_a_png_without_exif_leaves_it_upright() {
        let path = scratch("plain.png");
        sample().save(&path).unwrap();
        let loaded = crate::loader::load(&path).unwrap();
        assert_eq!(loaded.dimensions(), (120, 80));
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn batch_export_writes_every_file_and_reports_each_one() {
        let dir = std::env::temp_dir().join("openimages_batch_in");
        let out = std::env::temp_dir().join("openimages_batch_out");
        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&out);
        std::fs::create_dir_all(&dir).unwrap();

        // Two real images of different sizes, plus one path that isn't an image.
        let a = dir.join("a.png");
        let b = dir.join("b.png");
        sample().save(&a).unwrap();
        sample().resize_exact(40, 40, image::imageops::FilterType::Nearest).save(&b).unwrap();
        let bad = dir.join("not-an-image.png");
        std::fs::write(&bad, b"definitely not a png").unwrap();

        let ops = vec![crate::pipeline::Operation::Crop {
            x: 0.0,
            y: 0.0,
            width: 0.5,
            height: 1.0,
        }];

        let results = batch_export(
            ops,
            vec![
                a.to_string_lossy().into(),
                b.to_string_lossy().into(),
                bad.to_string_lossy().into(),
            ],
            out.to_string_lossy().into(),
            OutputFormat::Png,
            90,
            WHITE,
            "-out".into(),
        )
        .unwrap();

        assert_eq!(results.len(), 3);
        assert!(results[0].ok && results[1].ok);
        // One unreadable file must not abort the run.
        assert!(!results[2].ok, "garbage file should fail on its own");
        assert!(results[2].message.contains("decode"), "{}", results[2].message);

        // The normalized crop means each file keeps its own proportions.
        assert_eq!(image::open(out.join("a-out.png")).unwrap().dimensions(), (60, 80));
        assert_eq!(image::open(out.join("b-out.png")).unwrap().dimensions(), (20, 40));

        std::fs::remove_dir_all(&dir).ok();
        std::fs::remove_dir_all(&out).ok();
    }

    #[test]
    fn batch_export_refuses_to_overwrite_its_own_source() {
        let dir = std::env::temp_dir().join("openimages_batch_clobber");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let src = dir.join("x.png");
        sample().save(&src).unwrap();

        // Same directory, no suffix, same extension.
        let r = batch_export(
            vec![],
            vec![src.to_string_lossy().into()],
            dir.to_string_lossy().into(),
            OutputFormat::Png,
            90,
            WHITE,
            "".into(),
        )
        .unwrap();

        assert!(!r[0].ok);
        assert!(r[0].message.contains("overwrite"), "{}", r[0].message);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn batch_export_reports_output_collisions_without_replacing_files() {
        let dir = scratch(&format!("batch-collisions-{}", std::process::id()));
        std::fs::create_dir(&dir).unwrap();
        let first = dir.join("photo.png");
        let second = dir.join("photo.bmp");
        let other = dir.join("other.png");
        let output = dir.join("photo-out.png");
        let existing = dir.join("other-out.png");
        sample().save(&first).unwrap();
        RgbaImage::new(40, 40).save(&second).unwrap();
        sample().save(&other).unwrap();
        std::fs::write(&existing, b"keep this file").unwrap();

        let results = batch_export(
            vec![],
            [&first, &second, &other].map(|path| path.to_string_lossy().into()).to_vec(),
            dir.to_string_lossy().into(),
            OutputFormat::Png,
            90,
            WHITE,
            "-out".into(),
        )
        .unwrap();

        assert!(results[0].ok);
        for result in &results[1..] {
            assert!(!result.ok && result.message.contains("overwrite"), "{}", result.message);
        }
        assert_eq!(image::open(&output).unwrap().dimensions(), (120, 80));
        assert_eq!(std::fs::read(&existing).unwrap(), b"keep this file");
        for path in [first, second, other, output, existing] {
            std::fs::remove_file(path).unwrap();
        }
        std::fs::remove_dir(dir).unwrap();
    }

    #[test]
    fn batch_export_removes_new_file_when_encoding_fails() {
        let src = scratch(&format!("batch-oversized-{}.png", std::process::id()));
        RgbaImage::new(300, 300).save(&src).unwrap();
        let dest = src.with_extension("ico");
        let results = batch_export(
            vec![],
            vec![src.to_string_lossy().into()],
            src.parent().unwrap().to_string_lossy().into(),
            OutputFormat::Ico,
            90,
            WHITE,
            "".into(),
        )
        .unwrap();
        assert!(!results[0].ok && results[0].message.contains("256x256"));
        assert!(!dest.exists(), "incomplete output was left behind");
        std::fs::remove_file(src).unwrap();
    }
}
