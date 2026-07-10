# OpenImages

A local image toolkit. Crop, resize, orient, recolor, blur/sharpen, convert
between formats, and generate a full favicon set — without uploading anything to
a stranger's website.

Tauri v2 shell, React + TypeScript UI, all pixel work in Rust.

## Running it

```bash
npm install
npm run tauri dev      # dev, with hot reload
npm run tauri build    # installer in src-tauri/target/release/bundle/
```

Rust tests:

```bash
cd src-tauri && cargo test --lib
```

## How it's put together

The editor is one idea: an ordered list of operations applied to an image.

- The UI holds an `EditState` (`src/lib/ops.ts`) and compiles it to an
  `Operation[]`.
- Rust applies that list (`src-tauri/src/pipeline.rs`) and hands back pixels.

The shell is a browser-style tab strip inside a custom titlebar. Home is a
permanent first tab: a searchable launcher over `src/tools/registry.ts`. Opening
a tool gives it a tab that owns its own image, edits and export settings;
reopening that tool returns you to it rather than starting over.

**Adding a tool** means: one entry in `registry.ts` (name, blurb, keywords), one
`Operation` variant plus an arm in `apply()` in `pipeline.rs`, and one panel case
in `ToolPanel.tsx`. The tab, the home card, and the search all follow.

### Two details worth knowing

**Previews render against a proxy.** On load we cache a copy scaled to a 1600px
longest edge. Slider drags re-render that, not your 50-megapixel source, which is
what keeps them interactive. Exports always run the same pipeline against the
full-resolution original. The output dimensions in the status bar come from the
backend's full-res calculation, so the number you see is never the proxy's.

**Crop coordinates are fractions, not pixels.** A crop of `{x: 0.25, width: 0.5}`
means the same region whether it lands on the proxy or the source. This is why
rotate and flip run *before* crop in the pipeline: you drag the rectangle on the
rotated preview, so its coordinates are only meaningful in that space.

## Notes

- EXIF orientation is baked in at load. Phone photos store an unrotated sensor
  readout plus a rotation tag; if we didn't apply it up front, a crop rectangle
  drawn in the UI would land on the wrong pixels.
- The format dropdown is populated from `supported_formats()`, which asks the
  `image` crate what it can actually encode rather than trusting a hardcoded list.
- `favicon.ico` is written by hand rather than via a library — it needs to be a
  *multi-size* icon (16/32/48), and the container format is a header plus one
  16-byte directory entry per PNG payload. Tests walk the bytes.
- Non-square logos are letterboxed into square icons, not center-cropped, so a
  wide wordmark keeps its edges.
- JPEG export flattens alpha (the format has no alpha channel); the export bar
  warns when that's about to happen.

- The window is undecorated (`decorations: false`); the titlebar, drag region and
  minimize/maximize/close are ours. That needs explicit `core:window:*`
  permissions in `capabilities/default.json` — without them the buttons throw at
  runtime, not at build time.
- Settings live in `localStorage` and are loaded spread over defaults, so a
  config written by an older build still boots. The accent is one CSS variable;
  every shade derives from it with `color-mix`.

## Not there yet

- No undo/redo history — `Reset` clears all edits.
- One image at a time; no batch processing.
- Resize uses `image`'s Lanczos3. A SIMD resizer (`fast_image_resize`) would be
  meaningfully faster on large exports.
