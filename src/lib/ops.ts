export type ResampleFilter = "nearest" | "triangle" | "catmullRom" | "lanczos3";

export type Anchor =
  | "topLeft" | "top" | "topRight"
  | "left" | "center" | "right"
  | "bottomLeft" | "bottom" | "bottomRight";

export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

export type Operation =
  | { kind: "crop"; x: number; y: number; width: number; height: number }
  | { kind: "resize"; width: number; height: number; filter: ResampleFilter }
  | { kind: "rotate"; degrees: number }
  | { kind: "flip"; horizontal: boolean; vertical: boolean }
  | { kind: "pad"; width: number; height: number; color: Color; anchor: Anchor }
  | { kind: "border"; width: number; color: Color }
  | { kind: "adjust"; brightness: number; contrast: number; saturation: number; hue: number }
  | { kind: "gamma"; value: number }
  | { kind: "levels"; black: number; white: number }
  | { kind: "temperature"; temp: number; tint: number }
  | { kind: "autoContrast" }
  | { kind: "sepia"; amount: number }
  | { kind: "duotone"; shadow: Color; highlight: Color; amount: number }
  | { kind: "posterize"; levels: number }
  | { kind: "threshold"; level: number }
  | { kind: "grayscale" }
  | { kind: "invert" }
  | { kind: "blur"; sigma: number }
  | { kind: "sharpen"; sigma: number; threshold: number }
  | { kind: "pixelate"; size: number }
  | { kind: "noise"; amount: number; monochrome: boolean; seed: number }
  | { kind: "edgeDetect" }
  | { kind: "vignette"; amount: number; radius: number; softness: number }
  | { kind: "opacity"; amount: number }
  | { kind: "roundCorners"; radius: number }
  | { kind: "circleCrop" }
  | {
      kind: "dropShadow";
      dx: number;
      dy: number;
      sigma: number;
      color: Color;
      opacity: number;
      expand: boolean;
    };

/** Normalized crop rect, 0..1 in source space. */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const rgb = (r: number, g: number, b: number, a = 255): Color => ({ r, g, b, a });

export const toHex = (c: Color) =>
  "#" + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, "0")).join("");

export function fromHex(hex: string, a = 255): Color {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16) || 0,
    g: parseInt(h.slice(2, 4), 16) || 0,
    b: parseInt(h.slice(4, 6), 16) || 0,
    a,
  };
}

export interface EditState {
  // Geometry
  crop: CropRect | null;
  resize: { width: number; height: number; filter: ResampleFilter } | null;
  rotate: number;
  flipH: boolean;
  flipV: boolean;
  pad: { width: number; height: number; color: Color; anchor: Anchor } | null;
  border: { width: number; color: Color };

  // Tone & color
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  gamma: number;
  levels: { black: number; white: number };
  temperature: { temp: number; tint: number };
  autoContrast: boolean;
  sepia: number;
  duotone: { shadow: Color; highlight: Color; amount: number };
  posterize: number;
  threshold: number | null;
  grayscale: boolean;
  invert: boolean;

  // Effects
  blur: number;
  sharpen: number;
  pixelate: number;
  noise: { amount: number; monochrome: boolean; seed: number };
  edges: boolean;
  vignette: { amount: number; radius: number; softness: number };

  // Alpha & framing
  opacity: number;
  round: number;
  circle: boolean;
  shadow: { dx: number; dy: number; sigma: number; color: Color; opacity: number; expand: boolean };
}

export const INITIAL_EDIT: EditState = {
  crop: null,
  resize: null,
  rotate: 0,
  flipH: false,
  flipV: false,
  pad: null,
  border: { width: 0, color: rgb(255, 255, 255) },

  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
  gamma: 1,
  levels: { black: 0, white: 255 },
  temperature: { temp: 0, tint: 0 },
  autoContrast: false,
  sepia: 0,
  duotone: { shadow: rgb(28, 20, 60), highlight: rgb(255, 200, 120), amount: 0 },
  posterize: 0,
  threshold: null,
  grayscale: false,
  invert: false,

  blur: 0,
  sharpen: 0,
  pixelate: 0,
  noise: { amount: 0, monochrome: false, seed: 1 },
  edges: false,
  vignette: { amount: 0, radius: 60, softness: 45 },

  opacity: 100,
  round: 0,
  circle: false,
  shadow: { dx: 8, dy: 10, sigma: 8, color: rgb(0, 0, 0), opacity: 0, expand: true },
};

export function isDirty(e: EditState): boolean {
  return JSON.stringify(e) !== JSON.stringify(INITIAL_EDIT);
}

/**
 * Order matters and is deliberate.
 *
 * Geometry first. Rotate and flip run *before* crop because the user drags the
 * crop rectangle on the rotated preview — its normalized coordinates are only
 * meaningful in that post-rotation space. Swapping those two silently crops the
 * wrong region.
 *
 * Then tone, then effects. Blur, sharpen and vignette come after resize because
 * their radii are in *output* pixels: a 2px blur should look like 2px in the
 * file you ship, not in the original.
 *
 * Framing is last, and internally ordered: `border` before `roundCorners` so the
 * corners round through the border rather than leaving square tabs sticking out,
 * and `dropShadow` dead last because it reads the finished alpha silhouette.
 */
export function buildOps(e: EditState): Operation[] {
  const ops: Operation[] = [];

  if (e.rotate % 360 !== 0) ops.push({ kind: "rotate", degrees: e.rotate % 360 });
  if (e.flipH || e.flipV) ops.push({ kind: "flip", horizontal: e.flipH, vertical: e.flipV });
  if (e.crop) ops.push({ kind: "crop", ...e.crop });
  if (e.resize) ops.push({ kind: "resize", ...e.resize });
  if (e.pad) ops.push({ kind: "pad", ...e.pad });

  if (e.autoContrast) ops.push({ kind: "autoContrast" });
  if (e.levels.black !== 0 || e.levels.white !== 255) ops.push({ kind: "levels", ...e.levels });
  if (e.gamma !== 1) ops.push({ kind: "gamma", value: e.gamma });
  if (e.brightness || e.contrast || e.saturation || e.hue) {
    ops.push({
      kind: "adjust",
      brightness: e.brightness,
      contrast: e.contrast,
      saturation: e.saturation,
      hue: e.hue,
    });
  }
  if (e.temperature.temp || e.temperature.tint) ops.push({ kind: "temperature", ...e.temperature });
  if (e.sepia > 0) ops.push({ kind: "sepia", amount: e.sepia });
  if (e.duotone.amount > 0) ops.push({ kind: "duotone", ...e.duotone });
  if (e.posterize >= 2) ops.push({ kind: "posterize", levels: e.posterize });
  if (e.threshold !== null) ops.push({ kind: "threshold", level: e.threshold });
  if (e.grayscale) ops.push({ kind: "grayscale" });
  if (e.invert) ops.push({ kind: "invert" });

  if (e.edges) ops.push({ kind: "edgeDetect" });
  if (e.pixelate > 1) ops.push({ kind: "pixelate", size: e.pixelate });
  if (e.noise.amount > 0) ops.push({ kind: "noise", ...e.noise });
  if (e.blur > 0) ops.push({ kind: "blur", sigma: e.blur });
  if (e.sharpen > 0) ops.push({ kind: "sharpen", sigma: e.sharpen, threshold: 0 });
  if (e.vignette.amount > 0) ops.push({ kind: "vignette", ...e.vignette });

  if (e.opacity < 100) ops.push({ kind: "opacity", amount: e.opacity });
  if (e.border.width > 0) ops.push({ kind: "border", ...e.border });
  if (e.circle) ops.push({ kind: "circleCrop" });
  else if (e.round > 0) ops.push({ kind: "roundCorners", radius: e.round });
  if (e.shadow.opacity > 0) ops.push({ kind: "dropShadow", ...e.shadow });

  return ops;
}
