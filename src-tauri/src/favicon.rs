//! Favicon set generation: the ICO plus the PNGs and manifest a site actually
//! needs, so this replaces a round-trip to a favicon-generator website.

use image::{DynamicImage, ImageEncoder};
use std::io::Cursor;
use std::path::{Path, PathBuf};

/// Sizes packed into favicon.ico. 48 is what Windows uses for taskbar pins.
const ICO_SIZES: [u32; 3] = [16, 32, 48];

pub struct FaviconSet {
    pub apple_touch: u32,
    pub android: [u32; 2],
}

impl Default for FaviconSet {
    fn default() -> Self {
        Self {
            apple_touch: 180,
            android: [192, 512],
        }
    }
}

pub fn generate(img: &DynamicImage, out_dir: &Path, set: &FaviconSet) -> Result<Vec<String>, String> {
    std::fs::create_dir_all(out_dir).map_err(|e| e.to_string())?;
    let mut written = Vec::new();

    let mut frames = Vec::new();
    for size in ICO_SIZES {
        frames.push((size, png_bytes(&square(img, size))?));
    }
    write(out_dir, "favicon.ico", &build_ico(&frames)?, &mut written)?;

    for size in [16u32, 32] {
        let name = format!("favicon-{size}x{size}.png");
        let bytes = png_bytes(&square(img, size))?;
        write(out_dir, &name, &bytes, &mut written)?;
    }

    let bytes = png_bytes(&square(img, set.apple_touch))?;
    write(out_dir, "apple-touch-icon.png", &bytes, &mut written)?;

    for size in set.android {
        let name = format!("android-chrome-{size}x{size}.png");
        let bytes = png_bytes(&square(img, size))?;
        write(out_dir, &name, &bytes, &mut written)?;
    }

    write(out_dir, "site.webmanifest", MANIFEST.as_bytes(), &mut written)?;
    write(out_dir, "head-snippet.html", SNIPPET.as_bytes(), &mut written)?;

    Ok(written)
}

fn write(dir: &Path, name: &str, bytes: &[u8], written: &mut Vec<String>) -> Result<(), String> {
    let path: PathBuf = dir.join(name);
    std::fs::write(&path, bytes).map_err(|e| format!("writing {name}: {e}"))?;
    written.push(name.to_string());
    Ok(())
}

/// Icons must be square. Fit the whole image inside rather than cropping it —
/// a logo that loses its edges to a center-crop is worse than one with padding.
fn square(img: &DynamicImage, size: u32) -> DynamicImage {
    let fitted = img.resize(size, size, image::imageops::FilterType::Lanczos3);
    if fitted.width() == size && fitted.height() == size {
        return fitted;
    }
    let mut canvas = image::RgbaImage::new(size, size);
    let x = (size - fitted.width()) / 2;
    let y = (size - fitted.height()) / 2;
    image::imageops::overlay(&mut canvas, &fitted.to_rgba8(), x as i64, y as i64);
    DynamicImage::ImageRgba8(canvas)
}

fn png_bytes(img: &DynamicImage) -> Result<Vec<u8>, String> {
    let rgba = img.to_rgba8();
    let mut buf = Vec::new();
    image::codecs::png::PngEncoder::new(Cursor::new(&mut buf))
        .write_image(
            rgba.as_raw(),
            rgba.width(),
            rgba.height(),
            image::ExtendedColorType::Rgba8,
        )
        .map_err(|e| e.to_string())?;
    Ok(buf)
}

/// Hand-rolled because we need a *multi-size* ICO, and the format is trivial:
/// a header, one 16-byte directory entry per image, then the payloads. Entries
/// hold PNG data, which every browser since IE11 reads.
fn build_ico(frames: &[(u32, Vec<u8>)]) -> Result<Vec<u8>, String> {
    if frames.is_empty() || frames.len() > u16::MAX as usize {
        return Err("bad icon frame count".into());
    }

    let mut out = Vec::new();
    out.extend_from_slice(&0u16.to_le_bytes()); // reserved
    out.extend_from_slice(&1u16.to_le_bytes()); // 1 = icon (2 would be cursor)
    out.extend_from_slice(&(frames.len() as u16).to_le_bytes());

    const HEADER: usize = 6;
    const ENTRY: usize = 16;
    let mut offset = HEADER + ENTRY * frames.len();

    for (size, png) in frames {
        if *size == 0 || *size > 256 {
            return Err(format!("icon size {size} out of range"));
        }
        // 256 is stored as 0; the field is a single byte.
        let dim = if *size == 256 { 0u8 } else { *size as u8 };
        out.push(dim); // width
        out.push(dim); // height
        out.push(0); // palette size, 0 = truecolor
        out.push(0); // reserved
        out.extend_from_slice(&1u16.to_le_bytes()); // color planes
        out.extend_from_slice(&32u16.to_le_bytes()); // bits per pixel
        out.extend_from_slice(&(png.len() as u32).to_le_bytes());
        out.extend_from_slice(&(offset as u32).to_le_bytes());
        offset += png.len();
    }

    for (_, png) in frames {
        out.extend_from_slice(png);
    }
    Ok(out)
}

// `r##"..."##`, not `r#"..."#` — the color literals contain `"#`, which would
// close a single-hash raw string.
const MANIFEST: &str = r##"{
  "name": "",
  "short_name": "",
  "icons": [
    { "src": "/android-chrome-192x192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/android-chrome-512x512.png", "sizes": "512x512", "type": "image/png" }
  ],
  "theme_color": "#ffffff",
  "background_color": "#ffffff",
  "display": "standalone"
}
"##;

const SNIPPET: &str = r#"<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
"#;

#[cfg(test)]
mod tests {
    use super::*;
    use image::{GenericImageView, RgbaImage};

    const PNG_MAGIC: &[u8] = &[0x89, b'P', b'N', b'G'];

    fn img(w: u32, h: u32) -> DynamicImage {
        DynamicImage::ImageRgba8(RgbaImage::from_pixel(w, h, image::Rgba([200, 30, 30, 255])))
    }

    fn le16(b: &[u8]) -> u16 {
        u16::from_le_bytes([b[0], b[1]])
    }
    fn le32(b: &[u8]) -> u32 {
        u32::from_le_bytes([b[0], b[1], b[2], b[3]])
    }

    /// Walks the ICO the way a browser would: header, then each directory entry's
    /// (offset, length) must land exactly on a PNG payload.
    #[test]
    fn ico_directory_offsets_point_at_real_payloads() {
        let frames: Vec<(u32, Vec<u8>)> = ICO_SIZES
            .iter()
            .map(|&s| (s, png_bytes(&square(&img(64, 64), s)).unwrap()))
            .collect();
        let ico = build_ico(&frames).unwrap();

        assert_eq!(le16(&ico[0..2]), 0, "reserved");
        assert_eq!(le16(&ico[2..4]), 1, "type = icon");
        assert_eq!(le16(&ico[4..6]) as usize, frames.len());

        for (i, &size) in ICO_SIZES.iter().enumerate() {
            let e = &ico[6 + i * 16..6 + (i + 1) * 16];
            assert_eq!(e[0] as u32, size, "width byte");
            assert_eq!(e[1] as u32, size, "height byte");
            assert_eq!(le16(&e[4..6]), 1, "planes");
            assert_eq!(le16(&e[6..8]), 32, "bpp");

            let len = le32(&e[8..12]) as usize;
            let off = le32(&e[12..16]) as usize;
            assert!(off + len <= ico.len(), "entry {i} runs past end of file");
            assert_eq!(&ico[off..off + 4], PNG_MAGIC, "entry {i} is not a PNG");
        }

        let payload: usize = frames.iter().map(|(_, p)| p.len()).sum();
        assert_eq!(ico.len(), 6 + 16 * frames.len() + payload, "no slack bytes");
    }

    #[test]
    fn ico_encodes_256_as_zero() {
        // The width/height fields are one byte, so 256 has to be written as 0.
        let frames = vec![(256u32, png_bytes(&img(256, 256)).unwrap())];
        let ico = build_ico(&frames).unwrap();
        assert_eq!(ico[6], 0);
        assert_eq!(ico[7], 0);
    }

    #[test]
    fn ico_rejects_out_of_range_sizes() {
        assert!(build_ico(&[(257, vec![0])]).is_err());
        assert!(build_ico(&[(0, vec![0])]).is_err());
        assert!(build_ico(&[]).is_err());
    }

    #[test]
    fn wide_logos_are_letterboxed_not_cropped() {
        let out = square(&img(400, 100), 64);
        assert_eq!(out.dimensions(), (64, 64));

        let rgba = out.to_rgba8();
        // Content band is centered vertically: 400x100 fits to 64x16 at rows 24..40.
        assert_eq!(rgba.get_pixel(32, 32).0[3], 255, "center is opaque content");
        assert_eq!(rgba.get_pixel(32, 2).0[3], 0, "top band is transparent padding");
        assert_eq!(rgba.get_pixel(32, 61).0[3], 0, "bottom band is transparent padding");
    }

    #[test]
    fn generate_writes_the_full_set() {
        let dir = std::env::temp_dir().join("openimages_favicon_test");
        let _ = std::fs::remove_dir_all(&dir);

        let written = generate(&img(512, 512), &dir, &FaviconSet::default()).unwrap();
        for name in [
            "favicon.ico",
            "favicon-16x16.png",
            "favicon-32x32.png",
            "apple-touch-icon.png",
            "android-chrome-192x192.png",
            "android-chrome-512x512.png",
            "site.webmanifest",
            "head-snippet.html",
        ] {
            assert!(written.contains(&name.to_string()), "{name} missing from report");
            assert!(dir.join(name).exists(), "{name} not on disk");
        }

        // The manifest is a raw string containing `"#...` — make sure it survived.
        let manifest = std::fs::read_to_string(dir.join("site.webmanifest")).unwrap();
        assert!(manifest.contains("\"theme_color\": \"#ffffff\""));

        let ico = std::fs::read(dir.join("favicon.ico")).unwrap();
        assert_eq!(le16(&ico[4..6]) as usize, ICO_SIZES.len());

        std::fs::remove_dir_all(&dir).unwrap();
    }
}
