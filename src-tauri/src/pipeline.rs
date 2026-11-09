//! The whole editor is one idea: an ordered list of `Operation`s applied to an
//! image. The UI builds the list, the backend runs it. Adding a new tool means
//! adding a variant here and a panel in the UI — nothing else changes.

use fast_image_resize::{FilterType as FastFilter, ResizeAlg, ResizeOptions, Resizer};
use image::imageops::FilterType;
use image::{DynamicImage, GenericImageView, Rgba, RgbaImage};
use serde::{Deserialize, Serialize};

/// Previews render against a downscaled proxy. Operations whose parameters are
/// measured in *pixels* — border width, corner radius, blur sigma — must shrink
/// with it, or a 40px border previews six times too thick on a 6000px source.
/// Ratios (crop, gamma, saturation) are scale-free and pass through untouched.
///
/// The factor is recomputed before every operation by comparing the working
/// image against `dims_after`'s full-resolution simulation, so a `Resize` in the
/// middle of the pipeline correctly re-bases everything after it. During an
/// export the two always agree and every scale is exactly 1.0.
#[derive(Debug, Clone, Copy)]
pub struct Scale(pub f32);

impl Scale {
    pub const FULL: Scale = Scale(1.0);

    /// Zero stays zero — a disabled border must not round up to one pixel.
    fn px(self, v: u32) -> u32 {
        if v == 0 {
            0
        } else {
            ((v as f32 * self.0).round() as u32).max(1)
        }
    }

    fn pxf(self, v: f32) -> f32 {
        v * self.0
    }

    fn pxi(self, v: i32) -> i32 {
        (v as f32 * self.0).round() as i32
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ResampleFilter {
    Nearest,
    Triangle,
    CatmullRom,
    Lanczos3,
}

impl From<ResampleFilter> for FilterType {
    fn from(f: ResampleFilter) -> Self {
        match f {
            ResampleFilter::Nearest => FilterType::Nearest,
            ResampleFilter::Triangle => FilterType::Triangle,
            ResampleFilter::CatmullRom => FilterType::CatmullRom,
            ResampleFilter::Lanczos3 => FilterType::Lanczos3,
        }
    }
}

impl From<ResampleFilter> for ResizeAlg {
    fn from(filter: ResampleFilter) -> Self {
        let filter = match filter {
            ResampleFilter::Nearest => return Self::Nearest,
            ResampleFilter::Triangle => FastFilter::Bilinear,
            ResampleFilter::CatmullRom => FastFilter::CatmullRom,
            ResampleFilter::Lanczos3 => FastFilter::Lanczos3,
        };
        Self::Convolution(filter)
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Color {
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub a: u8,
}

impl Color {
    fn rgba(self) -> Rgba<u8> {
        Rgba([self.r, self.g, self.b, self.a])
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Anchor {
    TopLeft,
    Top,
    TopRight,
    Left,
    Center,
    Right,
    BottomLeft,
    Bottom,
    BottomRight,
}

impl Anchor {
    /// Where the content sits inside the container. Can go negative when the
    /// content is larger, which `overlay` clips for us.
    fn offset(self, cw: u32, ch: u32, iw: u32, ih: u32) -> (i64, i64) {
        let (cw, ch, iw, ih) = (cw as i64, ch as i64, iw as i64, ih as i64);
        let (mx, my) = (cw - iw, ch - ih);
        use Anchor::*;
        let x = match self {
            TopLeft | Left | BottomLeft => 0,
            Top | Center | Bottom => mx / 2,
            TopRight | Right | BottomRight => mx,
        };
        let y = match self {
            TopLeft | Top | TopRight => 0,
            Left | Center | Right => my / 2,
            BottomLeft | Bottom | BottomRight => my,
        };
        (x, y)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Operation {
    // ── Geometry ────────────────────────────────────────────────────────
    /// Coordinates are fractions of the source, not pixels, so the same crop
    /// applies unchanged to the full-res image and the downscaled preview proxy.
    Crop {
        x: f32,
        y: f32,
        width: f32,
        height: f32,
    },
    ColorKey {
        color: Color,
        tolerance: u8,
    },
    Resize {
        width: u32,
        height: u32,
        filter: ResampleFilter,
    },
    /// Clockwise; anything not a multiple of 90 is ignored.
    Rotate {
        degrees: u32,
    },
    Flip {
        horizontal: bool,
        vertical: bool,
    },
    /// Grow (or shrink) the canvas without scaling the image.
    Pad {
        width: u32,
        height: u32,
        color: Color,
        anchor: Anchor,
    },
    Border {
        width: u32,
        color: Color,
    },

    // ── Tone & color ────────────────────────────────────────────────────
    /// All four are zero-centered. brightness/contrast/saturation are -100..100,
    /// hue is -180..180 degrees.
    Adjust {
        brightness: f32,
        contrast: f32,
        saturation: f32,
        hue: f32,
    },
    Exposure {
        stops: f32,
    },
    /// `value` > 1 brightens midtones, < 1 darkens them.
    Gamma {
        value: f32,
    },
    /// Remap [black, white] onto the full range.
    Levels {
        black: u8,
        white: u8,
    },
    /// Both -100..100. Temperature is amber/blue, tint is magenta/green.
    Temperature {
        temp: f32,
        tint: f32,
    },
    /// Stretch each channel so its darkest pixel is 0 and its brightest is 255.
    AutoContrast,
    Sepia {
        amount: f32,
    },
    Duotone {
        shadow: Color,
        highlight: Color,
        amount: f32,
    },
    /// 2..=255 levels per channel.
    Posterize {
        levels: u8,
    },
    /// Luma at or above `level` becomes white, below becomes black.
    Threshold {
        level: u8,
    },
    Grayscale,
    Invert,

    // ── Effects ─────────────────────────────────────────────────────────
    Blur {
        sigma: f32,
    },
    Sharpen {
        sigma: f32,
        threshold: i32,
    },
    /// Average each `size`×`size` block.
    Pixelate {
        size: u32,
    },
    /// Deterministic: the same pixel always gets the same offset for a seed.
    Noise {
        amount: f32,
        monochrome: bool,
        seed: u32,
    },
    /// Sobel magnitude on luma.
    EdgeDetect,
    Emboss {
        amount: f32,
    },
    /// `amount`, `radius`, `softness` are all 0..100.
    Vignette {
        amount: f32,
        radius: f32,
        softness: f32,
    },

    // ── Alpha & framing ─────────────────────────────────────────────────
    /// 0..100; multiplies the existing alpha rather than replacing it.
    Opacity {
        amount: f32,
    },
    RoundCorners {
        radius: u32,
    },
    /// Mask to the inscribed ellipse.
    CircleCrop,
    DropShadow {
        dx: i32,
        dy: i32,
        sigma: f32,
        color: Color,
        opacity: f32,
        /// Grow the canvas to fit the shadow instead of clipping it.
        expand: bool,
    },
}

/// Run the pipeline at full resolution.
pub fn apply_all(img: DynamicImage, ops: &[Operation]) -> DynamicImage {
    let dims = img.dimensions();
    apply_all_tracked(img, ops, dims)
}

/// Run the pipeline against a possibly-downscaled `img`, where `full` is the
/// size the same pipeline would start from at full resolution.
///
/// We simulate the full-res geometry alongside the real work. The ratio between
/// the two is the scale for the *next* operation, which is what lets a pixel-unit
/// op sitting after a `Resize` still preview at the right size.
pub fn apply_all_tracked(
    mut img: DynamicImage,
    ops: &[Operation],
    full: (u32, u32),
) -> DynamicImage {
    let mut virt = full;
    for op in ops {
        let scale = Scale(img.width() as f32 / virt.0.max(1) as f32);
        img = apply(img, op, scale);
        virt = dims_after(op, virt);
    }
    img
}

/// The size the pipeline produces at full resolution, without touching a pixel.
/// This must mirror `apply`'s geometry exactly; `dims_after_matches_apply` checks it.
pub fn output_dims(ops: &[Operation], full: (u32, u32)) -> (u32, u32) {
    ops.iter().fold(full, |d, op| dims_after(op, d))
}

fn dims_after(op: &Operation, (w, h): (u32, u32)) -> (u32, u32) {
    match *op {
        Operation::Crop { x, y, width, height } => {
            let (px, py, pw, ph) = crop_rect(w, h, x, y, width, height);
            let _ = (px, py);
            if pw == 0 || ph == 0 {
                (w, h)
            } else {
                (pw, ph)
            }
        }
        Operation::Resize { width, height, .. } => {
            if width == 0 || height == 0 {
                (w, h)
            } else {
                (width, height)
            }
        }
        Operation::Rotate { degrees } => match degrees % 360 {
            90 | 270 => (h, w),
            _ => (w, h),
        },
        Operation::Pad { width, height, .. } => {
            if width == 0 || height == 0 {
                (w, h)
            } else {
                (width, height)
            }
        }
        Operation::Border { width, .. } => {
            if width == 0 {
                (w, h)
            } else {
                (w + width * 2, h + width * 2)
            }
        }
        Operation::DropShadow { dx, dy, sigma, opacity, expand, .. } => {
            if opacity <= 0.0 || !expand {
                return (w, h);
            }
            let (l, t, r, b) = shadow_margins(dx, dy, sigma);
            ((w as i32 + l + r).max(1) as u32, (h as i32 + t + b).max(1) as u32)
        }
        _ => (w, h),
    }
}

fn apply(img: DynamicImage, op: &Operation, s: Scale) -> DynamicImage {
    match *op {
        Operation::Crop {
            x,
            y,
            width,
            height,
        } => crop(img, x, y, width, height),

        Operation::Resize {
            width,
            height,
            filter,
        } => {
            let (w, h) = (s.px(width), s.px(height));
            if w == 0 || h == 0 || (w, h) == img.dimensions() {
                return img;
            }
            let mut out = DynamicImage::new(w, h, img.color());
            let options = ResizeOptions::new().resize_alg(filter.into());
            if out.set_color_space(img.color_space()).is_ok()
                && Resizer::new().resize(&img, &mut out, &options).is_ok()
            {
                out
            } else {
                drop(out);
                img.resize_exact(w, h, filter.into())
            }
        }

        Operation::Rotate { degrees } => match degrees % 360 {
            90 => img.rotate90(),
            180 => img.rotate180(),
            270 => img.rotate270(),
            _ => img,
        },

        Operation::Flip {
            horizontal,
            vertical,
        } => {
            let img = if horizontal { img.fliph() } else { img };
            if vertical {
                img.flipv()
            } else {
                img
            }
        }

        Operation::Pad {
            width,
            height,
            color,
            anchor,
        } => pad(img, s.px(width), s.px(height), color, anchor),

        Operation::Border { width, color } => {
            let b = s.px(width);
            if b == 0 {
                return img;
            }
            let (iw, ih) = img.dimensions();
            pad(img, iw + b * 2, ih + b * 2, color, Anchor::Center)
        }

        Operation::Adjust {
            brightness,
            contrast,
            saturation,
            hue,
        } => {
            let img = if brightness != 0.0 || contrast != 0.0 || saturation != 0.0 {
                adjust(img, brightness, contrast, saturation)
            } else {
                img
            };
            if hue != 0.0 {
                img.huerotate(hue as i32)
            } else {
                img
            }
        }

        Operation::Exposure { stops } => exposure(img, stops),

        Operation::Gamma { value } => {
            if value <= 0.0 || (value - 1.0).abs() < f32::EPSILON {
                return img;
            }
            // A lookup table beats calling powf 3× per pixel.
            let inv = 1.0 / value;
            let lut: [u8; 256] = std::array::from_fn(|i| {
                (((i as f32 / 255.0).powf(inv)) * 255.0).round().clamp(0.0, 255.0) as u8
            });
            map_rgb(img, |c| [lut[c[0] as usize], lut[c[1] as usize], lut[c[2] as usize]])
        }

        Operation::Levels { black, white } => {
            if black >= white {
                return img;
            }
            let (lo, hi) = (black as f32, white as f32);
            let span = hi - lo;
            let lut: [u8; 256] =
                std::array::from_fn(|i| (((i as f32 - lo) / span) * 255.0).clamp(0.0, 255.0) as u8);
            map_rgb(img, |c| [lut[c[0] as usize], lut[c[1] as usize], lut[c[2] as usize]])
        }

        Operation::Temperature { temp, tint } => {
            if temp == 0.0 && tint == 0.0 {
                return img;
            }
            let t = temp * 0.6;
            let g = tint * 0.6;
            map_rgb(img, |c| {
                [
                    clamp_u8(c[0] as f32 + t),
                    clamp_u8(c[1] as f32 + g),
                    clamp_u8(c[2] as f32 - t),
                ]
            })
        }

        Operation::AutoContrast => auto_contrast(img),

        Operation::Sepia { amount } => {
            if amount <= 0.0 {
                return img;
            }
            let k = (amount / 100.0).clamp(0.0, 1.0);
            map_rgb(img, |c| {
                let (r, g, b) = (c[0] as f32, c[1] as f32, c[2] as f32);
                let sr = 0.393 * r + 0.769 * g + 0.189 * b;
                let sg = 0.349 * r + 0.686 * g + 0.168 * b;
                let sb = 0.272 * r + 0.534 * g + 0.131 * b;
                [
                    clamp_u8(r + (sr - r) * k),
                    clamp_u8(g + (sg - g) * k),
                    clamp_u8(b + (sb - b) * k),
                ]
            })
        }

        Operation::Duotone {
            shadow,
            highlight,
            amount,
        } => {
            if amount <= 0.0 {
                return img;
            }
            let k = (amount / 100.0).clamp(0.0, 1.0);
            map_rgb(img, |c| {
                let t = luma(c[0], c[1], c[2]) as f32 / 255.0;
                let mix = |lo: u8, hi: u8| lo as f32 + (hi as f32 - lo as f32) * t;
                let d = [
                    mix(shadow.r, highlight.r),
                    mix(shadow.g, highlight.g),
                    mix(shadow.b, highlight.b),
                ];
                [
                    clamp_u8(c[0] as f32 + (d[0] - c[0] as f32) * k),
                    clamp_u8(c[1] as f32 + (d[1] - c[1] as f32) * k),
                    clamp_u8(c[2] as f32 + (d[2] - c[2] as f32) * k),
                ]
            })
        }

        Operation::Posterize { levels } => {
            if levels < 2 {
                return img;
            }
            let n = levels as f32;
            let lut: [u8; 256] = std::array::from_fn(|i| {
                let step = (i as f32 / 255.0 * (n - 1.0)).round();
                (step / (n - 1.0) * 255.0).round() as u8
            });
            map_rgb(img, |c| [lut[c[0] as usize], lut[c[1] as usize], lut[c[2] as usize]])
        }

        Operation::Threshold { level } => map_rgb(img, |c| {
            let v = if luma(c[0], c[1], c[2]) >= level { 255 } else { 0 };
            [v, v, v]
        }),

        // `DynamicImage::grayscale` returns Luma8, which would silently drop the
        // alpha channel and any later color op. Stay in RGBA.
        Operation::Grayscale => map_rgb(img, |c| {
            let l = luma(c[0], c[1], c[2]);
            [l, l, l]
        }),

        Operation::Invert => {
            let mut img = img;
            img.invert();
            img
        }

        Operation::Blur { sigma } => {
            let sigma = s.pxf(sigma);
            if sigma <= 0.05 {
                return img;
            }
            DynamicImage::ImageRgba8(image::imageops::fast_blur(&img.to_rgba8(), sigma))
        }

        Operation::Sharpen { sigma, threshold } => {
            let sigma = s.pxf(sigma);
            if sigma <= 0.05 {
                return img;
            }
            img.unsharpen(sigma, threshold)
        }

        Operation::Pixelate { size } => pixelate(img, s.px(size)),

        Operation::Noise {
            amount,
            monochrome,
            seed,
        } => noise(img, amount, monochrome, seed),

        Operation::EdgeDetect => edge_detect(img),

        Operation::Emboss { amount } => emboss(img, amount),

        Operation::Vignette {
            amount,
            radius,
            softness,
        } => vignette(img, amount, radius, softness),

        Operation::ColorKey { color, tolerance } => color_key(img, color, tolerance),

        Operation::Opacity { amount } => {
            let k = (amount / 100.0).clamp(0.0, 1.0);
            if (k - 1.0).abs() < f32::EPSILON {
                return img;
            }
            let mut buf = img.to_rgba8();
            for px in buf.pixels_mut() {
                px[3] = (px[3] as f32 * k).round() as u8;
            }
            DynamicImage::ImageRgba8(buf)
        }

        Operation::RoundCorners { radius } => {
            let r = s.px(radius);
            if r == 0 {
                return img;
            }
            round_corners(img, r as f32)
        }

        Operation::CircleCrop => circle_crop(img),

        Operation::DropShadow {
            dx,
            dy,
            sigma,
            color,
            opacity,
            expand,
        } => drop_shadow(
            img,
            s.pxi(dx),
            s.pxi(dy),
            s.pxf(sigma).max(0.0),
            color,
            opacity,
            expand,
        ),
    }
}

// ── Helpers ─────────────────────────────────────────────────────────────

#[inline]
fn clamp_u8(v: f32) -> u8 {
    v.clamp(0.0, 255.0).round() as u8
}

#[inline]
fn luma(r: u8, g: u8, b: u8) -> u8 {
    // Rec. 709 coefficients, matching what `image` uses elsewhere.
    (0.2126 * r as f32 + 0.7152 * g as f32 + 0.0722 * b as f32).round() as u8
}

fn exposure(img: DynamicImage, stops: f32) -> DynamicImage {
    if stops == 0.0 {
        return img;
    }
    let gain = stops.clamp(-4.0, 4.0).exp2();
    let lut: [u8; 256] = std::array::from_fn(|i| {
        let srgb = i as f32 / 255.0;
        let linear = if srgb <= 0.04045 {
            srgb / 12.92
        } else {
            ((srgb + 0.055) / 1.055).powf(2.4)
        } * gain;
        let srgb = if linear <= 0.0031308 {
            linear * 12.92
        } else {
            1.055 * linear.powf(1.0 / 2.4) - 0.055
        };
        clamp_u8(srgb * 255.0)
    });
    map_rgb(img, |channels| channels.map(|value| lut[value as usize]))
}

fn color_key(img: DynamicImage, color: Color, tolerance: u8) -> DynamicImage {
    let distance = (u16::from(tolerance.min(100)) * 255 / 100) as u8;
    let mut out = img.into_rgba8();
    for px in out.pixels_mut() {
        if px[0].abs_diff(color.r) <= distance
            && px[1].abs_diff(color.g) <= distance
            && px[2].abs_diff(color.b) <= distance
        {
            px[3] = 0;
        }
    }
    DynamicImage::ImageRgba8(out)
}

/// Per-pixel RGB map that leaves alpha alone.
fn map_rgb(img: DynamicImage, f: impl Fn([u8; 3]) -> [u8; 3]) -> DynamicImage {
    let mut buf = img.to_rgba8();
    for px in buf.pixels_mut() {
        let out = f([px[0], px[1], px[2]]);
        px[0] = out[0];
        px[1] = out[1];
        px[2] = out[2];
    }
    DynamicImage::ImageRgba8(buf)
}

/// Shared by `crop` and `dims_after` so the two can't disagree about rounding.
fn crop_rect(iw: u32, ih: u32, x: f32, y: f32, width: f32, height: f32) -> (u32, u32, u32, u32) {
    let px = (x.clamp(0.0, 1.0) * iw as f32).round() as u32;
    let py = (y.clamp(0.0, 1.0) * ih as f32).round() as u32;
    // Clamp the extent to what's actually left, so a rect dragged past the edge
    // narrows instead of panicking inside `crop_imm`.
    let pw = ((width.clamp(0.0, 1.0) * iw as f32).round() as u32).min(iw.saturating_sub(px));
    let ph = ((height.clamp(0.0, 1.0) * ih as f32).round() as u32).min(ih.saturating_sub(py));
    (px, py, pw, ph)
}

fn crop(img: DynamicImage, x: f32, y: f32, width: f32, height: f32) -> DynamicImage {
    let (iw, ih) = img.dimensions();
    let (px, py, pw, ph) = crop_rect(iw, ih, x, y, width, height);
    if pw == 0 || ph == 0 {
        return img;
    }
    img.crop_imm(px, py, pw, ph)
}

/// Gaussian energy is negligible past 3σ, so that's enough margin to keep the
/// blur from clipping against the canvas edge.
fn shadow_margins(dx: i32, dy: i32, sigma: f32) -> (i32, i32, i32, i32) {
    let pad = (sigma * 3.0).ceil() as i32;
    (
        pad + (-dx).max(0),
        pad + (-dy).max(0),
        pad + dx.max(0),
        pad + dy.max(0),
    )
}

/// One pass for all three so we quantize back to u8 once instead of three times.
fn adjust(img: DynamicImage, brightness: f32, contrast: f32, saturation: f32) -> DynamicImage {
    let b = brightness / 100.0;
    let c = contrast / 100.0 + 1.0;
    let sat = saturation / 100.0 + 1.0;

    map_rgb(img, |px| {
        let mut v = [
            px[0] as f32 / 255.0,
            px[1] as f32 / 255.0,
            px[2] as f32 / 255.0,
        ];
        for ch in v.iter_mut() {
            *ch += b;
            *ch = (*ch - 0.5) * c + 0.5;
        }
        let l = 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
        for ch in v.iter_mut() {
            *ch = l + (*ch - l) * sat;
        }
        [
            clamp_u8(v[0] * 255.0),
            clamp_u8(v[1] * 255.0),
            clamp_u8(v[2] * 255.0),
        ]
    })
}

fn pad(img: DynamicImage, width: u32, height: u32, color: Color, anchor: Anchor) -> DynamicImage {
    if width == 0 || height == 0 {
        return img;
    }
    let (iw, ih) = img.dimensions();
    if width == iw && height == ih && color.a == 0 {
        return img;
    }
    let mut canvas = RgbaImage::from_pixel(width, height, color.rgba());
    let (x, y) = anchor.offset(width, height, iw, ih);
    image::imageops::overlay(&mut canvas, &img.to_rgba8(), x, y);
    DynamicImage::ImageRgba8(canvas)
}

fn auto_contrast(img: DynamicImage) -> DynamicImage {
    let buf = img.to_rgba8();
    let mut lo = [255u8; 3];
    let mut hi = [0u8; 3];

    for px in buf.pixels() {
        // Fully transparent pixels carry meaningless color; letting them vote
        // would peg the range to whatever garbage sits behind the alpha.
        if px[3] == 0 {
            continue;
        }
        for c in 0..3 {
            lo[c] = lo[c].min(px[c]);
            hi[c] = hi[c].max(px[c]);
        }
    }

    let luts: Vec<[u8; 256]> = (0..3)
        .map(|c| {
            let (l, h) = (lo[c] as f32, hi[c] as f32);
            if h <= l {
                std::array::from_fn(|i| i as u8) // flat channel: identity
            } else {
                std::array::from_fn(|i| (((i as f32 - l) / (h - l)) * 255.0).clamp(0.0, 255.0) as u8)
            }
        })
        .collect();

    map_rgb(DynamicImage::ImageRgba8(buf), |px| {
        [
            luts[0][px[0] as usize],
            luts[1][px[1] as usize],
            luts[2][px[2] as usize],
        ]
    })
}

fn pixelate(img: DynamicImage, size: u32) -> DynamicImage {
    if size <= 1 {
        return img;
    }
    let mut buf = img.to_rgba8();
    let (w, h) = buf.dimensions();

    let mut by = 0;
    while by < h {
        let mut bx = 0;
        while bx < w {
            let (ex, ey) = ((bx + size).min(w), (by + size).min(h));
            let mut sum = [0u64; 4];
            let mut n = 0u64;
            for y in by..ey {
                for x in bx..ex {
                    let p = buf.get_pixel(x, y).0;
                    for c in 0..4 {
                        sum[c] += p[c] as u64;
                    }
                    n += 1;
                }
            }
            let avg = Rgba([
                (sum[0] / n) as u8,
                (sum[1] / n) as u8,
                (sum[2] / n) as u8,
                (sum[3] / n) as u8,
            ]);
            for y in by..ey {
                for x in bx..ex {
                    buf.put_pixel(x, y, avg);
                }
            }
            bx += size;
        }
        by += size;
    }
    DynamicImage::ImageRgba8(buf)
}

/// Hashing coordinates rather than walking a PRNG keeps noise stable when only
/// part of the image is re-rendered, and identical across preview and export
/// at the same resolution.
#[inline]
fn hash_noise(x: u32, y: u32, seed: u32) -> f32 {
    let mut h = x.wrapping_mul(0x9E37_79B9) ^ y.wrapping_mul(0x85EB_CA6B) ^ seed.wrapping_mul(0xC2B2_AE35);
    h ^= h >> 15;
    h = h.wrapping_mul(0x2545_F491);
    h ^= h >> 13;
    (h as f32 / u32::MAX as f32) - 0.5
}

fn noise(img: DynamicImage, amount: f32, monochrome: bool, seed: u32) -> DynamicImage {
    if amount <= 0.0 {
        return img;
    }
    let strength = (amount / 100.0).clamp(0.0, 1.0) * 128.0;
    let mut buf = img.to_rgba8();
    let (w, _) = buf.dimensions();

    for (x, y, px) in buf.enumerate_pixels_mut() {
        if monochrome {
            let n = hash_noise(x, y, seed) * 2.0 * strength;
            for c in 0..3 {
                px[c] = clamp_u8(px[c] as f32 + n);
            }
        } else {
            for c in 0..3 {
                // Offset the seed per channel so R, G and B don't move together.
                let n = hash_noise(x, y, seed ^ (c as u32).wrapping_mul(0x51ED_270B).wrapping_add(w))
                    * 2.0
                    * strength;
                px[c] = clamp_u8(px[c] as f32 + n);
            }
        }
    }
    DynamicImage::ImageRgba8(buf)
}

fn edge_detect(img: DynamicImage) -> DynamicImage {
    let src = img.to_rgba8();
    let (w, h) = src.dimensions();
    if w < 3 || h < 3 {
        return img;
    }

    let l = |x: u32, y: u32| {
        let p = src.get_pixel(x, y).0;
        luma(p[0], p[1], p[2]) as f32
    };

    let mut out = RgbaImage::new(w, h);
    const KX: [[f32; 3]; 3] = [[-1.0, 0.0, 1.0], [-2.0, 0.0, 2.0], [-1.0, 0.0, 1.0]];
    const KY: [[f32; 3]; 3] = [[-1.0, -2.0, -1.0], [0.0, 0.0, 0.0], [1.0, 2.0, 1.0]];

    for y in 1..h - 1 {
        for x in 1..w - 1 {
            let (mut gx, mut gy) = (0.0, 0.0);
            for j in 0usize..3 {
                for i in 0usize..3 {
                    let v = l(x + i as u32 - 1, y + j as u32 - 1);
                    gx += v * KX[j][i];
                    gy += v * KY[j][i];
                }
            }
            let m = clamp_u8((gx * gx + gy * gy).sqrt());
            out.put_pixel(x, y, Rgba([m, m, m, src.get_pixel(x, y)[3]]));
        }
    }
    DynamicImage::ImageRgba8(out)
}

fn emboss(img: DynamicImage, amount: f32) -> DynamicImage {
    if amount <= 0.0 {
        return img;
    }
    let mix = (amount / 100.0).min(1.0);
    let src = img.into_rgba8();
    let (w, h) = src.dimensions();
    let out = RgbaImage::from_fn(w, h, |x, y| {
        let [r, g, b, a] = src.get_pixel(x, y).0;
        let center = luma(r, g, b) as f32;
        let sample = |x, y| {
            let [r, g, b, a] = src.get_pixel(x, y).0;
            center + (luma(r, g, b) as f32 - center) * (a as f32 / 255.0)
        };
        let lit = sample(x.saturating_sub(1), y.saturating_sub(1));
        let shade = sample((x + 1).min(w - 1), (y + 1).min(h - 1));
        let relief = (128.0 + lit - shade).clamp(0.0, 255.0);
        let blend = |channel: u8| clamp_u8(channel as f32 * (1.0 - mix) + relief * mix);
        Rgba([blend(r), blend(g), blend(b), a])
    });
    DynamicImage::ImageRgba8(out)
}

fn vignette(img: DynamicImage, amount: f32, radius: f32, softness: f32) -> DynamicImage {
    if amount <= 0.0 {
        return img;
    }
    let k = (amount / 100.0).clamp(0.0, 1.0);
    let r = (radius / 100.0).clamp(0.0, 1.0) * 1.2;
    // A zero-width falloff band would divide by zero and produce a hard ring.
    let soft = ((softness / 100.0).clamp(0.0, 1.0) * 1.2).max(0.01);

    let mut buf = img.to_rgba8();
    let (w, h) = buf.dimensions();
    let (cx, cy) = (w as f32 / 2.0, h as f32 / 2.0);

    for (x, y, px) in buf.enumerate_pixels_mut() {
        let nx = (x as f32 + 0.5 - cx) / cx;
        let ny = (y as f32 + 0.5 - cy) / cy;
        let d = (nx * nx + ny * ny).sqrt();

        let t = ((d - r) / soft).clamp(0.0, 1.0);
        let smooth = t * t * (3.0 - 2.0 * t); // smoothstep
        let f = 1.0 - k * smooth;

        for c in 0..3 {
            px[c] = clamp_u8(px[c] as f32 * f);
        }
    }
    DynamicImage::ImageRgba8(buf)
}

/// Signed distance to a rounded box centered at the origin; negative inside.
#[inline]
fn sd_round_box(px: f32, py: f32, bx: f32, by: f32, r: f32) -> f32 {
    let qx = px.abs() - bx + r;
    let qy = py.abs() - by + r;
    let outside = (qx.max(0.0).powi(2) + qy.max(0.0).powi(2)).sqrt();
    outside + qx.max(qy).min(0.0) - r
}

fn round_corners(img: DynamicImage, radius: f32) -> DynamicImage {
    let mut buf = img.to_rgba8();
    let (w, h) = buf.dimensions();
    let (bx, by) = (w as f32 / 2.0, h as f32 / 2.0);
    // A radius past half the short edge would invert the corners.
    let r = radius.min(bx).min(by);

    for (x, y, px) in buf.enumerate_pixels_mut() {
        let d = sd_round_box(x as f32 + 0.5 - bx, y as f32 + 0.5 - by, bx, by, r);
        // One-pixel coverage ramp across the boundary gives cheap antialiasing.
        let cov = (0.5 - d).clamp(0.0, 1.0);
        px[3] = (px[3] as f32 * cov).round() as u8;
    }
    DynamicImage::ImageRgba8(buf)
}

fn circle_crop(img: DynamicImage) -> DynamicImage {
    let mut buf = img.to_rgba8();
    let (w, h) = buf.dimensions();
    let (rx, ry) = (w as f32 / 2.0, h as f32 / 2.0);

    for (x, y, px) in buf.enumerate_pixels_mut() {
        let nx = (x as f32 + 0.5 - rx) / rx;
        let ny = (y as f32 + 0.5 - ry) / ry;
        // Normalized distance isn't a true distance; rescale by the short radius
        // so the coverage ramp stays about one pixel wide.
        let d = ((nx * nx + ny * ny).sqrt() - 1.0) * rx.min(ry);
        let cov = (0.5 - d).clamp(0.0, 1.0);
        px[3] = (px[3] as f32 * cov).round() as u8;
    }
    DynamicImage::ImageRgba8(buf)
}

fn drop_shadow(
    img: DynamicImage,
    dx: i32,
    dy: i32,
    sigma: f32,
    color: Color,
    opacity: f32,
    expand: bool,
) -> DynamicImage {
    let k = (opacity / 100.0).clamp(0.0, 1.0);
    if k <= 0.0 {
        return img;
    }
    let src = img.to_rgba8();
    let (iw, ih) = src.dimensions();

    let (left, top, right, bottom) = if expand {
        shadow_margins(dx, dy, sigma)
    } else {
        (0, 0, 0, 0)
    };

    let cw = (iw as i32 + left + right).max(1) as u32;
    let ch = (ih as i32 + top + bottom).max(1) as u32;

    // Stamp the silhouette in the shadow color, keyed only on the source alpha.
    let mut layer = RgbaImage::new(cw, ch);
    for y in 0..ih {
        for x in 0..iw {
            let a = src.get_pixel(x, y)[3];
            if a == 0 {
                continue;
            }
            let tx = x as i32 + left + dx;
            let ty = y as i32 + top + dy;
            if tx < 0 || ty < 0 || tx >= cw as i32 || ty >= ch as i32 {
                continue;
            }
            layer.put_pixel(
                tx as u32,
                ty as u32,
                Rgba([color.r, color.g, color.b, (a as f32 * k).round() as u8]),
            );
        }
    }

    if sigma > 0.05 {
        layer = image::imageops::fast_blur(&layer, sigma);
    }

    image::imageops::overlay(&mut layer, &src, left as i64, top as i64);
    DynamicImage::ImageRgba8(layer)
}

#[cfg(test)]
mod tests {
    use super::*;

    const WHITE: Color = Color { r: 255, g: 255, b: 255, a: 255 };
    const BLACK: Color = Color { r: 0, g: 0, b: 0, a: 255 };

    fn solid(w: u32, h: u32, px: [u8; 4]) -> DynamicImage {
        DynamicImage::ImageRgba8(RgbaImage::from_pixel(w, h, Rgba(px)))
    }

    fn at(img: &DynamicImage, x: u32, y: u32) -> [u8; 4] {
        img.to_rgba8().get_pixel(x, y).0
    }

    fn one(img: DynamicImage, op: Operation) -> DynamicImage {
        apply(img, &op, Scale::FULL)
    }

    // ── Geometry ────────────────────────────────────────────────────────

    #[test]
    fn resize_preserves_bit_depth_and_resamples_transparent_edges() {
        let red = Rgba([65535u16, 0, 0, 65535]);
        let transparent_blue = Rgba([0u16, 0, 65535, 0]);
        let mut src = DynamicImage::ImageRgba16(image::ImageBuffer::from_fn(2, 1, |x, _| {
            if x == 0 { red } else { transparent_blue }
        }));
        let color_space = image::metadata::Cicp::DISPLAY_P3;
        src.set_color_space(color_space).unwrap();

        for filter in [
            ResampleFilter::Triangle,
            ResampleFilter::CatmullRom,
            ResampleFilter::Lanczos3,
        ] {
            let resized = one(src.clone(), Operation::Resize { width: 1, height: 1, filter });
            assert_eq!(resized.dimensions(), (1, 1));
            assert_eq!(resized.color_space(), color_space);
            let [r, g, b, a] = resized.as_rgba16().unwrap().get_pixel(0, 0).0;
            assert!(r >= 65534 && g == 0 && b == 0, "{filter:?} leaked hidden color");
            assert!(a.abs_diff(32768) <= 1, "{filter:?} lost half coverage: {a}");
        }

        let nearest = one(src, Operation::Resize {
            width: 4,
            height: 1,
            filter: ResampleFilter::Nearest,
        });
        assert_eq!(
            nearest.as_rgba16().unwrap().pixels().copied().collect::<Vec<_>>(),
            [red, red, transparent_blue, transparent_blue],
        );
    }

    #[test]
    fn crop_is_resolution_independent() {
        let op = Operation::Crop { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
        assert_eq!(one(solid(100, 100, [1; 4]), op.clone()).dimensions(), (50, 50));
        assert_eq!(one(solid(800, 400, [1; 4]), op).dimensions(), (400, 200));
    }

    #[test]
    fn crop_past_the_edge_narrows_instead_of_panicking() {
        let out = one(
            solid(100, 100, [1; 4]),
            Operation::Crop { x: 0.8, y: 0.8, width: 0.9, height: 0.9 },
        );
        assert_eq!(out.dimensions(), (20, 20));
    }

    #[test]
    fn degenerate_crop_is_a_no_op() {
        let out = one(
            solid(64, 64, [1; 4]),
            Operation::Crop { x: 0.5, y: 0.5, width: 0.0, height: 0.0 },
        );
        assert_eq!(out.dimensions(), (64, 64));
    }

    #[test]
    fn rotate_swaps_axes_only_on_odd_quarter_turns() {
        let img = solid(80, 20, [1; 4]);
        let r = |d| one(img.clone(), Operation::Rotate { degrees: d }).dimensions();
        assert_eq!(r(90), (20, 80));
        assert_eq!(r(180), (80, 20));
        assert_eq!(r(270), (20, 80));
        assert_eq!(r(45), (80, 20), "non-quarter turns are ignored");
    }

    #[test]
    fn pipeline_applies_in_listed_order() {
        // Rotate to 20x80, then crop the top half -> 20x40.
        let ops = vec![
            Operation::Rotate { degrees: 90 },
            Operation::Crop { x: 0.0, y: 0.0, width: 1.0, height: 0.5 },
        ];
        assert_eq!(apply_all(solid(80, 20, [1; 4]), &ops).dimensions(), (20, 40));
    }

    #[test]
    fn border_grows_the_canvas_on_both_sides() {
        let out = one(solid(10, 6, [9, 9, 9, 255]), Operation::Border { width: 3, color: WHITE });
        assert_eq!(out.dimensions(), (16, 12));
        assert_eq!(at(&out, 0, 0), [255, 255, 255, 255], "corner is border");
        assert_eq!(at(&out, 5, 5), [9, 9, 9, 255], "center is source");
    }

    #[test]
    fn pad_honors_the_anchor() {
        let img = solid(2, 2, [7, 7, 7, 255]);
        let p = |a| one(img.clone(), Operation::Pad { width: 6, height: 6, color: BLACK, anchor: a });

        assert_eq!(at(&p(Anchor::TopLeft), 0, 0), [7, 7, 7, 255]);
        assert_eq!(at(&p(Anchor::BottomRight), 5, 5), [7, 7, 7, 255]);
        assert_eq!(at(&p(Anchor::Center), 2, 2), [7, 7, 7, 255]);
        assert_eq!(at(&p(Anchor::TopLeft), 5, 5), [0, 0, 0, 255], "rest is fill");
    }

    #[test]
    fn pad_smaller_than_source_clips_without_panicking() {
        let out = one(
            solid(20, 20, [7, 7, 7, 255]),
            Operation::Pad { width: 8, height: 8, color: BLACK, anchor: Anchor::Center },
        );
        assert_eq!(out.dimensions(), (8, 8));
    }

    // ── Scale awareness ─────────────────────────────────────────────────

    #[test]
    fn pixel_unit_ops_shrink_with_the_preview_proxy() {
        // A 10px border on a half-scale proxy must draw as 5px, or the preview
        // lies about how thick the border will be.
        let half = Scale(0.5);
        let out = apply(solid(20, 20, [1; 4]), &Operation::Border { width: 10, color: WHITE }, half);
        assert_eq!(out.dimensions(), (30, 30), "5px each side, not 10");
    }

    #[test]
    fn ratio_ops_ignore_scale() {
        let op = Operation::Crop { x: 0.0, y: 0.0, width: 0.5, height: 1.0 };
        let full = apply(solid(40, 10, [1; 4]), &op, Scale::FULL);
        let half = apply(solid(20, 5, [1; 4]), &op, Scale(0.5));
        assert_eq!(full.dimensions(), (20, 10));
        assert_eq!(half.dimensions(), (10, 5), "still exactly half the width");
    }

    /// `dims_after` is a hand-written mirror of `apply`'s geometry. If they drift,
    /// every preview scale downstream is silently wrong — so check them against
    /// each other over every geometry-changing op.
    #[test]
    fn dims_after_matches_apply() {
        let cases: Vec<(&str, Operation)> = vec![
            ("crop", Operation::Crop { x: 0.1, y: 0.2, width: 0.55, height: 0.35 }),
            ("crop past edge", Operation::Crop { x: 0.9, y: 0.9, width: 0.5, height: 0.5 }),
            ("degenerate crop", Operation::Crop { x: 0.5, y: 0.5, width: 0.0, height: 0.0 }),
            ("resize", Operation::Resize { width: 77, height: 31, filter: ResampleFilter::Nearest }),
            ("resize zero", Operation::Resize { width: 0, height: 10, filter: ResampleFilter::Nearest }),
            ("rot90", Operation::Rotate { degrees: 90 }),
            ("rot180", Operation::Rotate { degrees: 180 }),
            ("rot270", Operation::Rotate { degrees: 270 }),
            ("rot45", Operation::Rotate { degrees: 45 }),
            ("flip", Operation::Flip { horizontal: true, vertical: true }),
            ("pad", Operation::Pad { width: 200, height: 150, color: BLACK, anchor: Anchor::Center }),
            ("pad shrink", Operation::Pad { width: 30, height: 20, color: BLACK, anchor: Anchor::TopLeft }),
            ("pad zero", Operation::Pad { width: 0, height: 0, color: BLACK, anchor: Anchor::Center }),
            ("border", Operation::Border { width: 7, color: WHITE }),
            ("border zero", Operation::Border { width: 0, color: WHITE }),
            ("shadow expand", Operation::DropShadow { dx: 5, dy: -3, sigma: 2.5, color: BLACK, opacity: 70.0, expand: true }),
            ("shadow clipped", Operation::DropShadow { dx: 5, dy: 3, sigma: 2.0, color: BLACK, opacity: 70.0, expand: false }),
            ("shadow off", Operation::DropShadow { dx: 5, dy: 3, sigma: 2.0, color: BLACK, opacity: 0.0, expand: true }),
            ("blur", Operation::Blur { sigma: 2.0 }),
            ("pixelate", Operation::Pixelate { size: 4 }),
            ("round", Operation::RoundCorners { radius: 5 }),
            ("circle", Operation::CircleCrop),
            ("grayscale", Operation::Grayscale),
        ];

        for (name, op) in cases {
            let src = solid(64, 48, [120, 90, 60, 255]);
            let actual = apply(src, &op, Scale::FULL).dimensions();
            let predicted = dims_after(&op, (64, 48));
            assert_eq!(predicted, actual, "dims_after disagrees with apply for {name}");
        }
    }

    #[test]
    fn output_dims_folds_a_whole_pipeline() {
        let ops = vec![
            Operation::Rotate { degrees: 90 },            // 20x80
            Operation::Crop { x: 0.0, y: 0.0, width: 1.0, height: 0.5 }, // 20x40
            Operation::Border { width: 5, color: WHITE }, // 30x50
        ];
        assert_eq!(output_dims(&ops, (80, 20)), (30, 50));
        assert_eq!(apply_all(solid(80, 20, [1; 4]), &ops).dimensions(), (30, 50));
    }

    /// The reason scale is recomputed per-op rather than fixed: a resize partway
    /// through re-bases everything after it.
    #[test]
    fn a_border_after_a_resize_previews_at_the_right_thickness() {
        let ops = vec![
            Operation::Resize { width: 400, height: 400, filter: ResampleFilter::Nearest },
            Operation::Border { width: 40, color: WHITE },
        ];

        // Full-res: 400x400 + 40 each side.
        assert_eq!(apply_all(solid(800, 800, [1; 4]), &ops).dimensions(), (480, 480));

        // Preview proxy at half scale. The resize lands at 200x200, so the border
        // must draw 20px — a fixed proxy-scale factor would have used the source
        // ratio and drawn it wrong.
        let out = apply_all_tracked(solid(400, 400, [1; 4]), &ops, (800, 800));
        assert_eq!(out.dimensions(), (240, 240), "border scaled to the resized image");
    }

    #[test]
    fn a_disabled_border_never_rounds_up_to_one_pixel() {
        // `px()` must map 0 -> 0. A naive `.max(1)` would draw a hairline border
        // on every image at every scale.
        let out = apply(solid(8, 8, [1; 4]), &Operation::Border { width: 0, color: WHITE }, Scale(0.3));
        assert_eq!(out.dimensions(), (8, 8));
    }

    // ── Color ───────────────────────────────────────────────────────────

    #[test]
    fn grayscale_keeps_the_alpha_channel() {
        let out = one(solid(4, 4, [200, 100, 50, 77]), Operation::Grayscale);
        let px = at(&out, 0, 0);
        assert_eq!(px[3], 77);
        assert_eq!(px[0], px[1]);
        assert_eq!(px[1], px[2]);
    }

    #[test]
    fn extreme_adjustments_clamp_without_wrapping() {
        let out = one(
            solid(2, 2, [250, 250, 250, 255]),
            Operation::Adjust { brightness: 100.0, contrast: 100.0, saturation: 100.0, hue: 0.0 },
        );
        assert_eq!(at(&out, 0, 0), [255, 255, 255, 255]);

        let out = one(
            solid(2, 2, [5, 5, 5, 255]),
            Operation::Adjust { brightness: -100.0, contrast: 100.0, saturation: 0.0, hue: 0.0 },
        );
        assert_eq!(at(&out, 0, 0), [0, 0, 0, 255]);
    }

    #[test]
    fn exposure_scales_linear_light_and_preserves_alpha() {
        let source = solid(1, 1, [64, 128, 240, 77]);
        let brighter = one(source.clone(), Operation::Exposure { stops: 1.0 });
        let darker = one(source, Operation::Exposure { stops: -1.0 });
        assert_eq!(at(&brighter, 0, 0), [90, 176, 255, 77]);
        assert_eq!(at(&darker, 0, 0), [44, 92, 176, 77]);
    }

    #[test]
    fn color_key_matches_within_tolerance_without_raising_alpha() {
        let key = Color { r: 0, g: 255, b: 0, a: 255 };
        let pixels = vec![0, 255, 0, 255, 38, 220, 3, 127, 39, 220, 3, 60, 255, 0, 0, 0];
        let source = DynamicImage::ImageRgba8(RgbaImage::from_raw(4, 1, pixels).unwrap());
        let exact = one(source.clone(), Operation::ColorKey { color: key, tolerance: 0 });
        assert_eq!(at(&exact, 0, 0)[3], 0);
        assert_eq!(at(&exact, 1, 0)[3], 127);

        let wide = one(source, Operation::ColorKey { color: key, tolerance: 15 });
        assert_eq!(at(&wide, 1, 0)[3], 0);
        assert_eq!(at(&wide, 2, 0), [39, 220, 3, 60]);
        assert_eq!(at(&wide, 3, 0)[3], 0);
    }

    #[test]
    fn gamma_of_one_is_identity_and_higher_brightens() {
        let img = solid(2, 2, [128, 128, 128, 255]);
        assert_eq!(at(&one(img.clone(), Operation::Gamma { value: 1.0 }), 0, 0), [128, 128, 128, 255]);
        assert!(at(&one(img.clone(), Operation::Gamma { value: 2.2 }), 0, 0)[0] > 128);
        assert!(at(&one(img, Operation::Gamma { value: 0.5 }), 0, 0)[0] < 128);
    }

    #[test]
    fn levels_stretch_the_range_and_reject_inverted_bounds() {
        let out = one(solid(1, 1, [128, 128, 128, 255]), Operation::Levels { black: 128, white: 255 });
        assert_eq!(at(&out, 0, 0)[0], 0, "black point maps to 0");

        // black >= white would divide by a non-positive span.
        let same = one(solid(1, 1, [70, 70, 70, 255]), Operation::Levels { black: 200, white: 50 });
        assert_eq!(at(&same, 0, 0)[0], 70, "invalid bounds are a no-op");
    }

    #[test]
    fn auto_contrast_ignores_fully_transparent_pixels() {
        // A transparent pixel carrying bogus white would otherwise flatten the
        // stretch and leave the visible pixels untouched.
        let mut buf = RgbaImage::new(2, 1);
        buf.put_pixel(0, 0, Rgba([100, 100, 100, 255]));
        buf.put_pixel(1, 0, Rgba([255, 255, 255, 0]));

        let out = one(DynamicImage::ImageRgba8(buf), Operation::AutoContrast);
        // Only one opaque pixel, so lo == hi: identity, not a divide-by-zero.
        assert_eq!(at(&out, 0, 0)[0], 100);
    }

    #[test]
    fn auto_contrast_stretches_a_flat_gray_ramp() {
        let mut buf = RgbaImage::new(2, 1);
        buf.put_pixel(0, 0, Rgba([100, 100, 100, 255]));
        buf.put_pixel(1, 0, Rgba([150, 150, 150, 255]));

        let out = one(DynamicImage::ImageRgba8(buf), Operation::AutoContrast);
        assert_eq!(at(&out, 0, 0)[0], 0);
        assert_eq!(at(&out, 1, 0)[0], 255);
    }

    #[test]
    fn threshold_splits_at_the_level() {
        let dark = one(solid(1, 1, [10, 10, 10, 255]), Operation::Threshold { level: 128 });
        let light = one(solid(1, 1, [200, 200, 200, 255]), Operation::Threshold { level: 128 });
        assert_eq!(at(&dark, 0, 0)[0], 0);
        assert_eq!(at(&light, 0, 0)[0], 255);
    }

    #[test]
    fn posterize_snaps_to_the_endpoints() {
        // Two levels must still reach pure black and pure white.
        let lo = one(solid(1, 1, [10, 10, 10, 255]), Operation::Posterize { levels: 2 });
        let hi = one(solid(1, 1, [250, 250, 250, 255]), Operation::Posterize { levels: 2 });
        assert_eq!(at(&lo, 0, 0)[0], 0);
        assert_eq!(at(&hi, 0, 0)[0], 255);

        let noop = one(solid(1, 1, [77, 77, 77, 255]), Operation::Posterize { levels: 1 });
        assert_eq!(at(&noop, 0, 0)[0], 77, "fewer than 2 levels is a no-op");
    }

    #[test]
    fn duotone_maps_black_and_white_to_the_two_stops() {
        let shadow = Color { r: 255, g: 0, b: 0, a: 255 };
        let highlight = Color { r: 0, g: 0, b: 255, a: 255 };
        let op = || Operation::Duotone { shadow, highlight, amount: 100.0 };

        assert_eq!(at(&one(solid(1, 1, [0, 0, 0, 255]), op()), 0, 0), [255, 0, 0, 255]);
        assert_eq!(at(&one(solid(1, 1, [255, 255, 255, 255]), op()), 0, 0), [0, 0, 255, 255]);
    }

    #[test]
    fn zero_amount_color_ops_are_skipped() {
        let img = solid(4, 4, [33, 66, 99, 255]);
        let raw = img.to_rgba8().into_raw();
        for op in [
            Operation::Sepia { amount: 0.0 },
            Operation::Duotone { shadow: BLACK, highlight: WHITE, amount: 0.0 },
            Operation::Temperature { temp: 0.0, tint: 0.0 },
            Operation::Vignette { amount: 0.0, radius: 50.0, softness: 50.0 },
            Operation::Noise { amount: 0.0, monochrome: false, seed: 1 },
        ] {
            assert_eq!(one(img.clone(), op).to_rgba8().into_raw(), raw);
        }
    }

    // ── Effects ─────────────────────────────────────────────────────────

    #[test]
    fn zero_magnitude_effects_are_skipped() {
        let img = solid(8, 8, [10, 20, 30, 255]);
        let raw = img.to_rgba8().into_raw();
        assert_eq!(one(img.clone(), Operation::Blur { sigma: 0.0 }).to_rgba8().into_raw(), raw);
        assert_eq!(
            one(img.clone(), Operation::Sharpen { sigma: 0.0, threshold: 0 }).to_rgba8().into_raw(),
            raw
        );
        assert_eq!(one(img.clone(), Operation::Pixelate { size: 1 }).to_rgba8().into_raw(), raw);
        assert_eq!(one(img, Operation::Opacity { amount: 100.0 }).to_rgba8().into_raw(), raw);
    }

    #[test]
    fn pixelate_averages_each_block_and_covers_ragged_edges() {
        // 3x1 image, block size 2 -> one full block and one 1px remainder.
        let mut buf = RgbaImage::new(3, 1);
        buf.put_pixel(0, 0, Rgba([0, 0, 0, 255]));
        buf.put_pixel(1, 0, Rgba([100, 100, 100, 255]));
        buf.put_pixel(2, 0, Rgba([200, 200, 200, 255]));

        let out = one(DynamicImage::ImageRgba8(buf), Operation::Pixelate { size: 2 });
        assert_eq!(at(&out, 0, 0)[0], 50);
        assert_eq!(at(&out, 1, 0)[0], 50);
        assert_eq!(at(&out, 2, 0)[0], 200, "trailing partial block keeps its own average");
    }

    #[test]
    fn noise_is_deterministic_for_a_seed_and_varies_across_seeds() {
        let img = solid(16, 16, [128, 128, 128, 255]);
        let a = one(img.clone(), Operation::Noise { amount: 50.0, monochrome: true, seed: 7 });
        let b = one(img.clone(), Operation::Noise { amount: 50.0, monochrome: true, seed: 7 });
        let c = one(img, Operation::Noise { amount: 50.0, monochrome: true, seed: 8 });

        assert_eq!(a.to_rgba8().into_raw(), b.to_rgba8().into_raw(), "same seed, same noise");
        assert_ne!(a.to_rgba8().into_raw(), c.to_rgba8().into_raw(), "different seed");
    }

    #[test]
    fn monochrome_noise_moves_channels_together() {
        let out = one(
            solid(8, 8, [128, 128, 128, 255]),
            Operation::Noise { amount: 60.0, monochrome: true, seed: 3 },
        );
        let px = at(&out, 4, 4);
        assert_eq!(px[0], px[1]);
        assert_eq!(px[1], px[2]);
    }

    #[test]
    fn noise_preserves_alpha() {
        let out = one(
            solid(4, 4, [128, 128, 128, 40]),
            Operation::Noise { amount: 100.0, monochrome: false, seed: 1 },
        );
        assert_eq!(at(&out, 2, 2)[3], 40);
    }

    #[test]
    fn emboss_shades_a_seam_and_keeps_alpha() {
        let source = RgbaImage::from_fn(4, 2, |x, _| {
            let v = if x < 2 { 32 } else { 112 };
            Rgba([v, v, v, 128])
        });
        let out = one(DynamicImage::ImageRgba8(source), Operation::Emboss { amount: 100.0 });
        assert_eq!(out.dimensions(), (4, 2));
        assert_eq!(at(&out, 0, 0), [128, 128, 128, 128]);
        assert_eq!(at(&out, 1, 0), [88, 88, 88, 128]);
    }

    #[test]
    fn edge_detect_finds_a_vertical_seam_and_ignores_flat_fields() {
        let mut buf = RgbaImage::new(5, 5);
        for y in 0..5 {
            for x in 0..5 {
                let v = if x < 2 { 0 } else { 255 };
                buf.put_pixel(x, y, Rgba([v, v, v, 255]));
            }
        }
        let out = one(DynamicImage::ImageRgba8(buf), Operation::EdgeDetect);
        assert!(at(&out, 2, 2)[0] > 200, "seam should light up");

        let flat = one(solid(5, 5, [90, 90, 90, 255]), Operation::EdgeDetect);
        assert_eq!(at(&flat, 2, 2)[0], 0, "flat field has no gradient");
    }

    #[test]
    fn vignette_darkens_corners_and_spares_the_center() {
        let out = one(
            solid(41, 41, [200, 200, 200, 255]),
            Operation::Vignette { amount: 100.0, radius: 10.0, softness: 60.0 },
        );
        assert_eq!(at(&out, 20, 20)[0], 200, "center untouched");
        assert!(at(&out, 0, 0)[0] < 60, "corner heavily darkened");
    }

    // ── Alpha & framing ─────────────────────────────────────────────────

    #[test]
    fn opacity_scales_existing_alpha_rather_than_replacing_it() {
        let out = one(solid(2, 2, [1, 2, 3, 100]), Operation::Opacity { amount: 50.0 });
        assert_eq!(at(&out, 0, 0)[3], 50, "50% of 100, not 128");
    }

    #[test]
    fn round_corners_clears_the_corner_and_keeps_the_middle() {
        let out = one(solid(32, 32, [9, 9, 9, 255]), Operation::RoundCorners { radius: 12 });
        assert_eq!(at(&out, 0, 0)[3], 0, "corner cut away");
        assert_eq!(at(&out, 16, 16)[3], 255, "center opaque");
        assert_eq!(at(&out, 16, 0)[3], 255, "mid-edge stays");
    }

    #[test]
    fn round_corner_radius_cannot_exceed_the_short_edge() {
        // An unclamped radius would make the SDF inside-out and erase the image.
        let out = one(solid(20, 8, [9, 9, 9, 255]), Operation::RoundCorners { radius: 999 });
        assert_eq!(at(&out, 10, 4)[3], 255, "center survives an absurd radius");
    }

    #[test]
    fn circle_crop_masks_corners_of_a_square() {
        let out = one(solid(41, 41, [9, 9, 9, 255]), Operation::CircleCrop);
        assert_eq!(at(&out, 0, 0)[3], 0);
        assert_eq!(at(&out, 20, 20)[3], 255);
        assert_eq!(at(&out, 20, 0)[3], 255, "top of the circle");
    }

    #[test]
    fn drop_shadow_expands_the_canvas_to_fit_the_blur() {
        let out = one(
            solid(10, 10, [9, 9, 9, 255]),
            Operation::DropShadow {
                dx: 4,
                dy: 4,
                sigma: 2.0,
                color: BLACK,
                opacity: 80.0,
                expand: true,
            },
        );
        // 3σ = 6 pad each side, plus the 4px offset on the bottom/right.
        assert_eq!(out.dimensions(), (10 + 6 + 6 + 4, 10 + 6 + 6 + 4));
    }

    #[test]
    fn drop_shadow_without_expand_keeps_the_canvas() {
        let out = one(
            solid(10, 10, [9, 9, 9, 255]),
            Operation::DropShadow {
                dx: 3,
                dy: 3,
                sigma: 1.0,
                color: BLACK,
                opacity: 80.0,
                expand: false,
            },
        );
        assert_eq!(out.dimensions(), (10, 10));
    }

    #[test]
    fn zero_opacity_shadow_is_a_no_op() {
        let img = solid(6, 6, [9, 9, 9, 255]);
        let out = one(
            img.clone(),
            Operation::DropShadow {
                dx: 5,
                dy: 5,
                sigma: 3.0,
                color: BLACK,
                opacity: 0.0,
                expand: true,
            },
        );
        assert_eq!(out.dimensions(), img.dimensions());
    }
}
