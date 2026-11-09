export type ToolId =
  // Transform
  | "crop" | "resize" | "orient" | "pad" | "border" | "round" | "circle"
  // Color
  | "adjust" | "exposure" | "gamma" | "levels" | "temperature" | "autocontrast"
  | "sepia" | "duotone" | "posterize" | "threshold" | "filter" | "colorKey"
  // Effects
  | "focus" | "vignette" | "pixelate" | "noise" | "shadow" | "edges" | "emboss" | "opacity"
  // Output
  | "convert" | "favicon" | "palette" | "datauri" | "batch";

export type CategoryId = "transform" | "color" | "effects" | "output";

export interface Category {
  id: CategoryId;
  name: string;
  blurb: string;
}

export interface Tool {
  id: ToolId;
  name: string;
  blurb: string;
  category: CategoryId;
  glyph: string;
  /** Extra search terms — what someone types when they don't know our name for it. */
  keywords: string[];
  /** An Export button is a lie for tools that write their own files. */
  hasExport: boolean;
  /**
   * Shows the format/quality controls even without an Export button — Data URI
   * encodes with them but copies to the clipboard instead of writing a file.
   */
  needsFormat?: boolean;
}

export const CATEGORIES: Category[] = [
  { id: "transform", name: "Transform", blurb: "Reshape the frame" },
  { id: "color", name: "Color", blurb: "Tone and palette" },
  { id: "effects", name: "Effects", blurb: "Focus and texture" },
  { id: "output", name: "Output", blurb: "Convert and generate" },
];

export const TOOLS: Tool[] = [
  // ── Transform ─────────────────────────────────────────────────────────
  {
    id: "crop",
    name: "Crop",
    blurb: "Trim to a region, with aspect presets.",
    category: "transform",
    glyph: "⧉",
    keywords: ["crop", "trim", "cut", "region", "aspect", "ratio", "square", "frame", "16:9"],
    hasExport: true,
  },
  {
    id: "resize",
    name: "Resize",
    blurb: "Scale to exact pixel dimensions.",
    category: "transform",
    glyph: "⤢",
    keywords: ["resize", "scale", "dimensions", "pixels", "px", "shrink", "enlarge", "downscale", "upscale", "width", "height", "thumbnail"],
    hasExport: true,
  },
  {
    id: "orient",
    name: "Rotate & Flip",
    blurb: "Quarter turns and mirroring.",
    category: "transform",
    glyph: "⟳",
    keywords: ["rotate", "flip", "mirror", "turn", "orientation", "straighten", "90", "180", "upside down"],
    hasExport: true,
  },
  {
    id: "pad",
    name: "Canvas & Padding",
    blurb: "Grow the canvas around the image.",
    category: "transform",
    glyph: "⬚",
    keywords: ["pad", "padding", "canvas", "extend", "expand", "margin", "letterbox", "background", "fill", "anchor", "position"],
    hasExport: true,
  },
  {
    id: "border",
    name: "Border",
    blurb: "Add a solid frame of any thickness.",
    category: "transform",
    glyph: "▣",
    keywords: ["border", "frame", "outline", "stroke", "edge", "matte"],
    hasExport: true,
  },
  {
    id: "round",
    name: "Rounded Corners",
    blurb: "Round the corners with clean antialiasing.",
    category: "transform",
    glyph: "◜",
    keywords: ["round", "rounded", "corners", "radius", "border radius", "squircle", "soften corners"],
    hasExport: true,
  },
  {
    id: "circle",
    name: "Circle Crop",
    blurb: "Mask to a circle or ellipse.",
    category: "transform",
    glyph: "◯",
    keywords: ["circle", "circular", "round crop", "ellipse", "oval", "avatar", "profile picture", "pfp", "mask"],
    hasExport: true,
  },

  // ── Color ─────────────────────────────────────────────────────────────
  {
    id: "adjust",
    name: "Color Adjust",
    blurb: "Brightness, contrast, saturation, hue.",
    category: "color",
    glyph: "◐",
    keywords: ["color", "colour", "brightness", "contrast", "saturation", "hue", "tone", "vibrance", "tint"],
    hasExport: true,
  },
  {
    id: "exposure",
    name: "Exposure",
    blurb: "Brighten or darken in stops.",
    category: "color",
    glyph: "☼",
    keywords: ["exposure", "ev", "stops", "brighten", "darken"],
    hasExport: true,
  },
  {
    id: "gamma",
    name: "Gamma",
    blurb: "Lift or crush midtones without clipping.",
    category: "color",
    glyph: "γ",
    keywords: ["gamma", "midtones", "curve", "linear"],
    hasExport: true,
  },
  {
    id: "levels",
    name: "Levels",
    blurb: "Set black and white points.",
    category: "color",
    glyph: "▤",
    keywords: ["levels", "black point", "white point", "histogram", "range", "clip", "stretch"],
    hasExport: true,
  },
  {
    id: "temperature",
    name: "Temperature & Tint",
    blurb: "Warm or cool, magenta or green.",
    category: "color",
    glyph: "🌡",
    keywords: ["temperature", "tint", "warm", "cool", "white balance", "wb", "kelvin", "magenta", "green", "orange", "blue"],
    hasExport: true,
  },
  {
    id: "autocontrast",
    name: "Auto Contrast",
    blurb: "Stretch each channel to the full range.",
    category: "color",
    glyph: "◫",
    keywords: ["auto", "contrast", "normalize", "equalize", "stretch", "levels", "enhance", "fix"],
    hasExport: true,
  },
  {
    id: "sepia",
    name: "Sepia",
    blurb: "Warm vintage tone.",
    category: "color",
    glyph: "◍",
    keywords: ["sepia", "vintage", "retro", "old", "brown", "antique", "aged", "faded"],
    hasExport: true,
  },
  {
    id: "duotone",
    name: "Duotone",
    blurb: "Map shadows and highlights to two colors.",
    category: "color",
    glyph: "◑",
    keywords: ["duotone", "two tone", "gradient map", "spotify", "bicolor", "tint", "colorize"],
    hasExport: true,
  },
  {
    id: "posterize",
    name: "Posterize",
    blurb: "Quantize to a few levels per channel.",
    category: "color",
    glyph: "▦",
    keywords: ["posterize", "quantize", "levels", "banding", "flat", "poster", "reduce colors", "retro"],
    hasExport: true,
  },
  {
    id: "threshold",
    name: "Threshold",
    blurb: "Hard split to pure black and white.",
    category: "color",
    glyph: "◧",
    keywords: ["threshold", "binary", "bilevel", "black white", "stencil", "silhouette", "cutoff", "1-bit"],
    hasExport: true,
  },
  {
    id: "filter",
    name: "Filters",
    blurb: "Grayscale and invert.",
    category: "color",
    glyph: "◒",
    keywords: ["filter", "grayscale", "greyscale", "black and white", "bw", "mono", "invert", "negative"],
    hasExport: true,
  },
  {
    id: "colorKey",
    name: "Color Key",
    blurb: "Make matching colors transparent.",
    category: "color",
    glyph: "◈",
    keywords: ["color key", "chroma key", "green screen", "remove background", "color mask", "tolerance"],
    hasExport: true,
  },

  // ── Effects ───────────────────────────────────────────────────────────
  {
    id: "focus",
    name: "Blur & Sharpen",
    blurb: "Soften or crisp up detail.",
    category: "effects",
    glyph: "✳",
    keywords: ["blur", "sharpen", "gaussian", "unsharp", "soften", "crisp", "focus", "smooth"],
    hasExport: true,
  },
  {
    id: "vignette",
    name: "Vignette",
    blurb: "Darken toward the edges.",
    category: "effects",
    glyph: "◉",
    keywords: ["vignette", "darken edges", "corners", "lens", "falloff", "focus attention", "cinematic"],
    hasExport: true,
  },
  {
    id: "pixelate",
    name: "Pixelate",
    blurb: "Average into blocks — censor or stylize.",
    category: "effects",
    glyph: "▩",
    keywords: ["pixelate", "mosaic", "censor", "blur face", "redact", "blocks", "8-bit", "retro", "anonymize"],
    hasExport: true,
  },
  {
    id: "noise",
    name: "Grain & Noise",
    blurb: "Add deterministic film grain.",
    category: "effects",
    glyph: "⁙",
    keywords: ["noise", "grain", "film", "texture", "dither", "static", "analog", "rough"],
    hasExport: true,
  },
  {
    id: "shadow",
    name: "Drop Shadow",
    blurb: "Cast a soft shadow behind the image.",
    category: "effects",
    glyph: "◨",
    keywords: ["shadow", "drop shadow", "elevation", "depth", "glow", "mockup", "screenshot", "box shadow"],
    hasExport: true,
  },
  {
    id: "edges",
    name: "Edge Detect",
    blurb: "Sobel gradient — outlines only.",
    category: "effects",
    glyph: "⌗",
    keywords: ["edge", "edges", "sobel", "outline", "contour", "line art", "detect", "gradient"],
    hasExport: true,
  },
  {
    id: "emboss",
    name: "Emboss",
    blurb: "Turn edges into raised relief.",
    category: "effects",
    glyph: "◇",
    keywords: ["emboss", "relief", "engrave", "bevel", "raised"],
    hasExport: true,
  },
  {
    id: "opacity",
    name: "Opacity",
    blurb: "Make the whole image semi-transparent.",
    category: "effects",
    glyph: "◪",
    keywords: ["opacity", "transparent", "transparency", "alpha", "fade", "watermark", "ghost"],
    hasExport: true,
  },

  // ── Output ────────────────────────────────────────────────────────────
  {
    id: "convert",
    name: "Convert",
    blurb: "Change format and compression.",
    category: "output",
    glyph: "⇄",
    keywords: ["convert", "format", "png", "jpeg", "jpg", "webp", "tiff", "bmp", "compress", "quality", "optimize", "transcode"],
    hasExport: true,
  },
  {
    id: "favicon",
    name: "Favicon Set",
    blurb: "ICO, PNGs, manifest and head snippet.",
    category: "output",
    glyph: "★",
    keywords: ["favicon", "ico", "icon", "apple touch", "manifest", "pwa", "browser tab", "site icon", "android chrome", "webmanifest"],
    hasExport: false,
  },
  {
    id: "palette",
    name: "Color Palette",
    blurb: "Pull the dominant colors as hex.",
    category: "output",
    glyph: "◈",
    keywords: ["palette", "colors", "dominant", "swatch", "hex", "extract", "theme", "brand", "picker", "eyedropper"],
    hasExport: false,
  },
  {
    id: "datauri",
    name: "Data URI",
    blurb: "Inline the image as base64 for CSS or HTML.",
    category: "output",
    glyph: "⎘",
    keywords: ["data uri", "data url", "base64", "inline", "embed", "css", "html", "encode", "copy"],
    hasExport: false,
    needsFormat: true,
  },
  {
    id: "batch",
    name: "Batch Export",
    blurb: "Apply this pipeline to many files at once.",
    category: "output",
    glyph: "≣",
    keywords: [
      "batch", "bulk", "many", "multiple", "folder", "all", "mass",
      "resize all", "convert all", "process", "queue",
    ],
    hasExport: false,
    needsFormat: true,
  },
];

export const toolById = (id: ToolId): Tool => TOOLS.find((t) => t.id === id)!;

/**
 * Ranked search over names, blurbs and keywords. A name match must outrank a
 * keyword match, or typing "icon" surfaces "Color Adjust" (whose blurb has no
 * "icon", but whose keywords nearly do) above "Favicon Set".
 */
export function searchTools(query: string): Tool[] {
  const q = query.trim().toLowerCase();
  if (!q) return TOOLS;

  const scored = TOOLS.map((tool) => {
    const name = tool.name.toLowerCase();
    let score = 0;

    if (name === q) score = 100;
    else if (name.startsWith(q)) score = 80;
    else if (name.includes(q)) score = 60;
    else if (tool.keywords.some((k) => k === q)) score = 50;
    else if (tool.keywords.some((k) => k.startsWith(q))) score = 40;
    else if (tool.keywords.some((k) => k.includes(q))) score = 25;
    else if (tool.blurb.toLowerCase().includes(q)) score = 15;
    else if (tool.category.includes(q)) score = 10;

    return { tool, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.tool);
}
