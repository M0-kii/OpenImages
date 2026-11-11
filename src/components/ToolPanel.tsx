import { useEffect, useState } from "react";
import { ColorField } from "./ColorField";
import { Slider } from "./Slider";
import { Select } from "./Select";
import { useDebounced } from "../hooks/useDebounced";
import {
  dataUri,
  extractPalette,
  type DocMeta,
  type OutputFormat,
  type Swatch,
} from "../lib/api";
import { rgb, type Anchor, type EditState, type Operation, type ResampleFilter } from "../lib/ops";
import { useSettings } from "../state/settings";
import type { ToolId } from "../tools/registry";

export interface PanelProps {
  tool: ToolId;
  doc: DocMeta;
  edit: EditState;
  patch: (p: Partial<EditState>) => void;
  ops: Operation[];
  format: OutputFormat;
  quality: number;
  aspect: number | null;
  setAspect: (a: number | null) => void;
  linked: boolean;
  setLinked: (v: boolean) => void;
  resizeInputSize: [number, number] | null;
  resizeInputError: string | null;
  onFavicon: () => void;
  faviconFiles: string[];
  busy: boolean;
}

const ASPECTS: [string, number | null][] = [
  ["Free", null],
  ["1:1", 1],
  ["16:9", 16 / 9],
  ["4:3", 4 / 3],
  ["3:2", 3 / 2],
];

const FILTERS: [string, ResampleFilter][] = [
  ["Lanczos3", "lanczos3"],
  ["CatmullRom", "catmullRom"],
  ["Triangle", "triangle"],
  ["Nearest", "nearest"],
];

const ANCHORS: Anchor[] = [
  "topLeft", "top", "topRight",
  "left", "center", "right",
  "bottomLeft", "bottom", "bottomRight",
];

export function ToolPanel(p: PanelProps) {
  switch (p.tool) {
    case "crop": return <CropPanel {...p} />;
    case "resize": return <ResizePanel {...p} />;
    case "orient": return <OrientPanel {...p} />;
    case "pad": return <PadPanel {...p} />;
    case "border": return <BorderPanel {...p} />;
    case "round": return <RoundPanel {...p} />;
    case "circle": return <CirclePanel {...p} />;

    case "adjust": return <AdjustPanel {...p} />;
    case "exposure": return <ExposurePanel {...p} />;
    case "gamma": return <GammaPanel {...p} />;
    case "levels": return <LevelsPanel {...p} />;
    case "temperature": return <TemperaturePanel {...p} />;
    case "autocontrast": return <AutoContrastPanel {...p} />;
    case "sepia": return <SepiaPanel {...p} />;
    case "duotone": return <DuotonePanel {...p} />;
    case "posterize": return <PosterizePanel {...p} />;
    case "threshold": return <ThresholdPanel {...p} />;
    case "filter": return <FilterPanel {...p} />;
    case "colorKey": return <ColorKeyPanel {...p} />;

    case "focus": return <FocusPanel {...p} />;
    case "vignette": return <VignettePanel {...p} />;
    case "pixelate": return <PixelatePanel {...p} />;
    case "noise": return <NoisePanel {...p} />;
    case "shadow": return <ShadowPanel {...p} />;
    case "edges": return <EdgesPanel {...p} />;
    case "emboss": return <EmbossPanel {...p} />;
    case "opacity": return <OpacityPanel {...p} />;

    case "convert": return <ConvertPanel {...p} />;
    case "favicon": return <FaviconPanel {...p} />;
    case "palette": return <PalettePanel {...p} />;
    case "datauri": return <DataUriPanel {...p} />;
  }
}

// ── Transform ──────────────────────────────────────────────────────────

function CropPanel({ edit, patch, aspect, setAspect }: PanelProps) {
  const c = edit.crop;
  return (
    <>
      <Group title="Aspect">
        <div className="chips">
          {ASPECTS.map(([name, a]) => (
            <button key={name} className={`chip ${aspect === a ? "chip--on" : ""}`} onClick={() => setAspect(a)}>
              {name}
            </button>
          ))}
        </div>
      </Group>
      <Group title="Selection">
        {c ? (
          <dl className="readout">
            <Row k="X" v={`${(c.x * 100).toFixed(1)}%`} />
            <Row k="Y" v={`${(c.y * 100).toFixed(1)}%`} />
            <Row k="W" v={`${(c.width * 100).toFixed(1)}%`} />
            <Row k="H" v={`${(c.height * 100).toFixed(1)}%`} />
          </dl>
        ) : (
          <p className="note">Drag on the image to select a region.</p>
        )}
        <button className="btn" disabled={!c} onClick={() => patch({ crop: null })}>
          Clear selection
        </button>
        <p className="note">Crop previews the oriented image before resize and effects.</p>
      </Group>
    </>
  );
}

function ResizePanel({ edit, patch, linked, setLinked, resizeInputSize, resizeInputError }: PanelProps) {
  if (!resizeInputSize) {
    return (
      <Group title="Dimensions">
        {resizeInputError ? (
          <p className="note note--err" role="alert">Could not calculate dimensions. {resizeInputError}</p>
        ) : (
          <p className="note" role="status">Calculating input dimensions…</p>
        )}
      </Group>
    );
  }
  const [baseW, baseH] = resizeInputSize;
  const rz = edit.resize ?? { width: baseW, height: baseH, filter: "lanczos3" as const };

  const setDim = (axis: "width" | "height", raw: number) => {
    const v = Math.max(1, Math.round(raw || 1));
    if (!linked) return patch({ resize: { ...rz, [axis]: v } });
    const ratio = baseW / baseH;
    patch({
      resize: {
        ...rz,
        width: axis === "width" ? v : Math.max(1, Math.round(v * ratio)),
        height: axis === "height" ? v : Math.max(1, Math.round(v / ratio)),
      },
    });
  };

  return (
    <>
      <Group title="Dimensions">
        <div className="row row--dims">
          <NumField label="Width" value={rz.width} onChange={(v) => setDim("width", v)} />
          <button
            className={`link-toggle ${linked ? "is-on" : ""}`}
            onClick={() => setLinked(!linked)}
            aria-pressed={linked}
            title="Lock aspect ratio"
          >
            {linked ? "≡" : "≠"}
          </button>
          <NumField label="Height" value={rz.height} onChange={(v) => setDim("height", v)} />
        </div>
        <div className="chips">
          {[25, 50, 75, 200].map((pct) => (
            <button
              key={pct}
              className="chip"
              onClick={() =>
                patch({
                  resize: {
                    ...rz,
                    width: Math.max(1, Math.round((baseW * pct) / 100)),
                    height: Math.max(1, Math.round((baseH * pct) / 100)),
                  },
                })
              }
            >
              {pct}%
            </button>
          ))}
        </div>
      </Group>
      <Group title="Resampling">
        <Select aria-label="Resampling" value={rz.filter} onChange={(v) => patch({ resize: { ...rz, filter: v as ResampleFilter } })} options={FILTERS} />
        <p className="note">Lanczos3 is sharpest for photos. Nearest preserves hard pixel edges — use it for pixel art.</p>
        {edit.resize && (
          <button className="btn btn--ghost" onClick={() => patch({ resize: null })}>
            Reset to {baseW}×{baseH}
          </button>
        )}
      </Group>
    </>
  );
}

function OrientPanel({ edit, patch }: PanelProps) {
  return (
    <>
      <Group title="Rotate">
        <div className="row">
          <button className="btn" onClick={() => patch({ rotate: (edit.rotate + 270) % 360 })}>↺ 90°</button>
          <button className="btn" onClick={() => patch({ rotate: (edit.rotate + 90) % 360 })}>↻ 90°</button>
        </div>
        <p className="note">Current rotation: <strong>{edit.rotate}°</strong></p>
      </Group>
      <Group title="Mirror">
        <Toggle label="Flip horizontal" on={edit.flipH} onClick={() => patch({ flipH: !edit.flipH })} />
        <Toggle label="Flip vertical" on={edit.flipV} onClick={() => patch({ flipV: !edit.flipV })} />
      </Group>
    </>
  );
}

function PadPanel({ doc, edit, patch }: PanelProps) {
  const pad = edit.pad ?? {
    width: doc.width,
    height: doc.height,
    color: { r: 255, g: 255, b: 255, a: 255 },
    anchor: "center" as Anchor,
  };
  const set = (v: Partial<typeof pad>) => patch({ pad: { ...pad, ...v } });

  return (
    <>
      <Group title="Canvas size">
        <div className="row row--dims">
          <NumField label="Width" value={pad.width} onChange={(w) => set({ width: Math.max(1, w) })} />
          <NumField label="Height" value={pad.height} onChange={(h) => set({ height: Math.max(1, h) })} />
        </div>
        <div className="chips">
          {[
            ["+10%", 1.1],
            ["+25%", 1.25],
            ["Square", 0],
          ].map(([name, k]) => (
            <button
              key={name as string}
              className="chip"
              onClick={() => {
                if (k === 0) {
                  const s = Math.max(doc.width, doc.height);
                  set({ width: s, height: s });
                } else {
                  set({
                    width: Math.round(doc.width * (k as number)),
                    height: Math.round(doc.height * (k as number)),
                  });
                }
              }}
            >
              {name as string}
            </button>
          ))}
        </div>
      </Group>

      <Group title="Position">
        <div className="anchorgrid">
          {ANCHORS.map((a) => (
            <button
              key={a}
              className={`anchorgrid__cell ${pad.anchor === a ? "is-on" : ""}`}
              onClick={() => set({ anchor: a })}
              aria-label={a}
              title={a}
            />
          ))}
        </div>
      </Group>

      <Group title="Fill">
        <ColorField label="Background" value={pad.color} onChange={(color) => set({ color })} alpha />
        <p className="note">Drop alpha to zero for transparent padding.</p>
        {edit.pad && <button className="btn btn--ghost" onClick={() => patch({ pad: null })}>Reset canvas</button>}
      </Group>
    </>
  );
}

function BorderPanel({ edit, patch }: PanelProps) {
  const b = edit.border;
  return (
    <Group title="Border">
      <Slider label="Thickness" value={b.width} min={0} max={200} suffix="px" reset={0} onChange={(width) => patch({ border: { ...b, width } })} />
      <ColorField label="Color" value={b.color} onChange={(color) => patch({ border: { ...b, color } })} alpha />
      <p className="note">The border grows the canvas outward; it never eats into the image.</p>
    </Group>
  );
}

function RoundPanel({ doc, edit, patch }: PanelProps) {
  const max = Math.floor(Math.min(doc.width, doc.height) / 2);
  return (
    <Group title="Corner radius">
      <Slider label="Radius" value={edit.round} min={0} max={max} suffix="px" reset={0} onChange={(round) => patch({ round })} />
      <div className="chips">
        {[
          ["8px", 8],
          ["16px", 16],
          ["Pill", max],
        ].map(([n, v]) => (
          <button key={n as string} className="chip" onClick={() => patch({ round: v as number })}>
            {n as string}
          </button>
        ))}
      </div>
      <p className="note">Export as PNG or WebP — JPEG has no alpha, so the corners would fill in black.</p>
    </Group>
  );
}

function CirclePanel({ edit, patch }: PanelProps) {
  return (
    <Group title="Circle mask">
      <Toggle label="Mask to circle" on={edit.circle} onClick={() => patch({ circle: !edit.circle })} />
      <p className="note">
        Non-square images become an ellipse. Crop to 1:1 first for a true circle — handy for avatars.
      </p>
      <p className="note">Needs an alpha-capable format: PNG or WebP.</p>
    </Group>
  );
}

// ── Color ──────────────────────────────────────────────────────────────

function AdjustPanel({ edit, patch }: PanelProps) {
  return (
    <>
      <Group title="Tone">
        <Slider label="Brightness" value={edit.brightness} onChange={(v) => patch({ brightness: v })} />
        <Slider label="Contrast" value={edit.contrast} onChange={(v) => patch({ contrast: v })} />
      </Group>
      <Group title="Color">
        <Slider label="Saturation" value={edit.saturation} onChange={(v) => patch({ saturation: v })} />
        <Slider label="Hue" value={edit.hue} min={-180} max={180} suffix="°" onChange={(v) => patch({ hue: v })} />
      </Group>
      <Group title=""><p className="note">Double-click any slider to reset it.</p></Group>
    </>
  );
}

function ExposurePanel({ edit, patch }: PanelProps) {
  return (
    <Group title="Exposure">
      <Slider
        label="Exposure"
        value={edit.exposure}
        min={-4}
        max={4}
        step={0.1}
        suffix=" EV"
        onChange={(exposure) => patch({ exposure })}
      />
      <p className="note">Each stop doubles or halves the amount of light.</p>
    </Group>
  );
}

function GammaPanel({ edit, patch }: PanelProps) {
  return (
    <Group title="Gamma">
      <Slider label="Gamma" value={edit.gamma} min={0.1} max={3} step={0.05} reset={1} onChange={(gamma) => patch({ gamma })} />
      <p className="note">
        Above <strong>1.00</strong> lifts midtones, below crushes them. Unlike brightness, the black and
        white points stay put — nothing clips.
      </p>
    </Group>
  );
}

function LevelsPanel({ edit, patch }: PanelProps) {
  const l = edit.levels;
  return (
    <Group title="Input levels">
      <Slider label="Black point" value={l.black} min={0} max={254} reset={0} onChange={(black) => patch({ levels: { ...l, black: Math.min(black, l.white - 1) } })} />
      <Slider label="White point" value={l.white} min={1} max={255} reset={255} onChange={(white) => patch({ levels: { ...l, white: Math.max(white, l.black + 1) } })} />
      <p className="note">Everything at or below the black point becomes pure black; at or above white becomes pure white.</p>
    </Group>
  );
}

function TemperaturePanel({ edit, patch }: PanelProps) {
  const t = edit.temperature;
  return (
    <Group title="White balance">
      <Slider label="Temperature" value={t.temp} onChange={(temp) => patch({ temperature: { ...t, temp } })} />
      <Slider label="Tint" value={t.tint} onChange={(tint) => patch({ temperature: { ...t, tint } })} />
      <p className="note">Temperature runs blue → amber. Tint runs magenta → green.</p>
    </Group>
  );
}

function AutoContrastPanel({ edit, patch }: PanelProps) {
  return (
    <Group title="Auto contrast">
      <Toggle label="Stretch to full range" on={edit.autoContrast} onClick={() => patch({ autoContrast: !edit.autoContrast })} />
      <p className="note">
        Finds the darkest and brightest value in each channel and remaps them to 0 and 255. Fully
        transparent pixels are ignored, so a padded PNG isn't skewed by whatever sits behind the alpha.
      </p>
      <p className="note">A flat channel is left alone rather than divided by zero.</p>
    </Group>
  );
}

function SepiaPanel({ edit, patch }: PanelProps) {
  return (
    <Group title="Sepia">
      <Slider label="Amount" value={edit.sepia} min={0} max={100} suffix="%" reset={0} onChange={(sepia) => patch({ sepia })} />
      <p className="note">Blends toward the classic sepia matrix. Pairs well with a little grain.</p>
    </Group>
  );
}

function DuotonePanel({ edit, patch }: PanelProps) {
  const d = edit.duotone;
  return (
    <Group title="Duotone">
      <Slider label="Amount" value={d.amount} min={0} max={100} suffix="%" reset={0} onChange={(amount) => patch({ duotone: { ...d, amount } })} />
      <ColorField label="Shadows" value={d.shadow} onChange={(shadow) => patch({ duotone: { ...d, shadow } })} />
      <ColorField label="Highlights" value={d.highlight} onChange={(highlight) => patch({ duotone: { ...d, highlight } })} />
      <p className="note">Each pixel's luma picks a point on the gradient between the two colors.</p>
    </Group>
  );
}

function PosterizePanel({ edit, patch }: PanelProps) {
  return (
    <Group title="Posterize">
      <Slider label="Levels" value={edit.posterize} min={0} max={32} reset={0} onChange={(posterize) => patch({ posterize })} />
      <p className="note">
        Levels per channel. <strong>0</strong> or <strong>1</strong> is off; <strong>2</strong> gives
        eight flat colors.
      </p>
    </Group>
  );
}

function ThresholdPanel({ edit, patch }: PanelProps) {
  const on = edit.threshold !== null;
  return (
    <Group title="Threshold">
      <Toggle label="Enable" on={on} onClick={() => patch({ threshold: on ? null : 128 })} />
      {on && (
        <Slider label="Cutoff" value={edit.threshold!} min={0} max={255} reset={128} onChange={(threshold) => patch({ threshold })} />
      )}
      <p className="note">Luma at or above the cutoff becomes white, below becomes black. Good for stencils and silhouettes.</p>
    </Group>
  );
}

function FilterPanel({ edit, patch }: PanelProps) {
  return (
    <Group title="Modes">
      <Toggle label="Grayscale" on={edit.grayscale} onClick={() => patch({ grayscale: !edit.grayscale })} />
      <Toggle label="Invert" on={edit.invert} onClick={() => patch({ invert: !edit.invert })} />
      <p className="note">Grayscale keeps the alpha channel, so transparent PNGs stay transparent.</p>
    </Group>
  );
}

function ColorKeyPanel({ edit, patch }: PanelProps) {
  const key = edit.colorKey;
  return (
    <Group title="Color key">
      <Toggle
        label="Remove matching color"
        on={key !== null}
        onClick={() => patch({ colorKey: key ? null : { color: rgb(0, 255, 0), tolerance: 15 } })}
      />
      {key && (
        <>
          <ColorField
            label="Color to remove"
            value={key.color}
            onChange={(color) => patch({ colorKey: { ...key, color } })}
          />
          <Slider
            label="Tolerance"
            value={key.tolerance}
            min={0}
            max={100}
            suffix="%"
            reset={15}
            onChange={(tolerance) => patch({ colorKey: { ...key, tolerance } })}
          />
          <p className="note">Matches the source colors before color adjustments. Export as PNG or WebP to keep transparency.</p>
        </>
      )}
    </Group>
  );
}

// ── Effects ────────────────────────────────────────────────────────────

function FocusPanel({ edit, patch }: PanelProps) {
  return (
    <Group title="Focus">
      <Slider label="Blur" value={edit.blur} min={0} max={30} step={0.5} suffix="px" reset={0} onChange={(blur) => patch({ blur })} />
      <Slider label="Sharpen" value={edit.sharpen} min={0} max={10} step={0.5} suffix="px" reset={0} onChange={(sharpen) => patch({ sharpen })} />
      <p className="note">Radii are in output pixels — they apply after any resize.</p>
    </Group>
  );
}

function VignettePanel({ edit, patch }: PanelProps) {
  const v = edit.vignette;
  return (
    <Group title="Vignette">
      <Slider label="Amount" value={v.amount} min={0} max={100} suffix="%" reset={0} onChange={(amount) => patch({ vignette: { ...v, amount } })} />
      <Slider label="Radius" value={v.radius} min={0} max={100} suffix="%" reset={60} onChange={(radius) => patch({ vignette: { ...v, radius } })} />
      <Slider label="Softness" value={v.softness} min={0} max={100} suffix="%" reset={45} onChange={(softness) => patch({ vignette: { ...v, softness } })} />
      <p className="note">Radius sets where the falloff starts; softness sets how wide the fade is.</p>
    </Group>
  );
}

function PixelatePanel({ edit, patch }: PanelProps) {
  return (
    <Group title="Pixelate">
      <Slider label="Block size" value={edit.pixelate} min={0} max={128} suffix="px" reset={0} onChange={(pixelate) => patch({ pixelate })} />
      <p className="note">Averages each block to one color. Use it to redact a face or a token in a screenshot.</p>
      <p className="note">Redaction warning: this destroys detail, but a large block is safer than a small one.</p>
    </Group>
  );
}

function NoisePanel({ edit, patch }: PanelProps) {
  const n = edit.noise;
  return (
    <Group title="Grain">
      <Slider label="Amount" value={n.amount} min={0} max={100} suffix="%" reset={0} onChange={(amount) => patch({ noise: { ...n, amount } })} />
      <Toggle label="Monochrome" on={n.monochrome} onClick={() => patch({ noise: { ...n, monochrome: !n.monochrome } })} />
      <div className="row row--dims">
        <NumField label="Seed" value={n.seed} onChange={(seed) => patch({ noise: { ...n, seed: Math.max(0, Math.round(seed)) } })} />
        <button className="btn" onClick={() => patch({ noise: { ...n, seed: Math.floor(Math.random() * 1e6) } })}>
          Reroll
        </button>
      </div>
      <p className="note">The same seed always produces the same grain, so exports match what you previewed.</p>
    </Group>
  );
}

function ShadowPanel({ edit, patch }: PanelProps) {
  const s = edit.shadow;
  const set = (v: Partial<typeof s>) => patch({ shadow: { ...s, ...v } });
  return (
    <>
      <Group title="Drop shadow">
        <Slider label="Opacity" value={s.opacity} min={0} max={100} suffix="%" reset={0} onChange={(opacity) => set({ opacity })} />
        <Slider label="Blur" value={s.sigma} min={0} max={60} step={0.5} suffix="px" reset={8} onChange={(sigma) => set({ sigma })} />
      </Group>
      <Group title="Offset">
        <Slider label="X" value={s.dx} min={-100} max={100} suffix="px" reset={8} onChange={(dx) => set({ dx })} />
        <Slider label="Y" value={s.dy} min={-100} max={100} suffix="px" reset={10} onChange={(dy) => set({ dy })} />
      </Group>
      <Group title="Appearance">
        <ColorField label="Shadow color" value={s.color} onChange={(color) => set({ color })} />
        <Toggle label="Expand canvas to fit" on={s.expand} onClick={() => set({ expand: !s.expand })} />
        <p className="note">With expand off, the shadow is clipped at the original bounds.</p>
      </Group>
    </>
  );
}

function EdgesPanel({ edit, patch }: PanelProps) {
  return (
    <Group title="Edge detect">
      <Toggle label="Sobel outline" on={edit.edges} onClick={() => patch({ edges: !edit.edges })} />
      <p className="note">Replaces the image with the magnitude of its luma gradient. Flat areas go black; edges glow.</p>
    </Group>
  );
}

function EmbossPanel({ edit, patch }: PanelProps) {
  return (
    <Group title="Emboss">
      <Slider label="Strength" value={edit.emboss} min={0} max={100} suffix="%" onChange={(emboss) => patch({ emboss })} />
      <p className="note">Blends the image with a grayscale relief.</p>
    </Group>
  );
}

function OpacityPanel({ edit, patch }: PanelProps) {
  return (
    <Group title="Opacity">
      <Slider label="Opacity" value={edit.opacity} min={0} max={100} suffix="%" reset={100} onChange={(opacity) => patch({ opacity })} />
      <p className="note">Multiplies the existing alpha rather than replacing it, so already-transparent areas stay transparent.</p>
      <p className="note">Export as PNG or WebP to keep it.</p>
    </Group>
  );
}

// ── Output ─────────────────────────────────────────────────────────────

function ConvertPanel({ doc }: PanelProps) {
  return (
    <Group title="Source">
      <dl className="readout readout--stack">
        <Row k="File" v={doc.name} truncate />
        <Row k="Size" v={`${doc.width}×${doc.height}`} />
        <Row k="Alpha" v={doc.hasAlpha ? "yes" : "no"} />
      </dl>
      <p className="note">Pick a format and quality in the bar below, then export. The list only offers formats this build can actually encode.</p>
    </Group>
  );
}

function FaviconPanel({ onFavicon, faviconFiles, busy }: PanelProps) {
  return (
    <Group title="Favicon set">
      <p className="note">
        Writes <code>favicon.ico</code> (16/32/48), the two PNGs, an Apple touch icon, Android Chrome
        icons, <code>site.webmanifest</code>, and the <code>&lt;head&gt;</code> snippet.
      </p>
      <p className="note">Non-square images are letterboxed, not cropped — a wide wordmark keeps its edges.</p>
      <button className="btn btn--primary" onClick={onFavicon} disabled={busy}>
        {busy ? "Generating…" : "Choose folder & generate"}
      </button>
      {faviconFiles.length > 0 && (
        <ul className="filelist">
          {faviconFiles.map((f) => <li key={f}>{f}</li>)}
        </ul>
      )}
    </Group>
  );
}

function PalettePanel({ doc, ops }: PanelProps) {
  const [count, setCount] = useState(6);
  const [swatches, setSwatches] = useState<Swatch[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  // Each extraction decodes and quantizes the image. Dragging the count slider
  // from 2 to 16 would otherwise fire fourteen of them.
  const opsKey = useDebounced(JSON.stringify(ops));
  const debouncedCount = useDebounced(count);

  useEffect(() => {
    let stale = false;
    extractPalette(doc.id, JSON.parse(opsKey) as Operation[], debouncedCount)
      .then((s) => !stale && setSwatches(s))
      .catch(() => !stale && setSwatches([]));
    return () => {
      stale = true;
    };
  }, [doc.id, opsKey, debouncedCount]);

  const copy = (hex: string) => {
    void navigator.clipboard.writeText(hex);
    setCopied(hex);
    setTimeout(() => setCopied((c) => (c === hex ? null : c)), 1200);
  };

  return (
    <>
      <Group title="Palette">
        <Slider label="Swatches" value={count} min={2} max={16} reset={6} onChange={setCount} />
        <div className="swatchlist">
          {swatches.map((s) => (
            <button key={s.hex} className="swatchrow" onClick={() => copy(s.hex)} title="Copy hex">
              <span className="swatchrow__chip" style={{ background: s.hex }} />
              <span className="swatchrow__hex">{copied === s.hex ? "copied" : s.hex}</span>
              <span className="swatchrow__pct">{(s.weight * 100).toFixed(1)}%</span>
            </button>
          ))}
        </div>
      </Group>
      <Group title="">
        <button
          className="btn"
          disabled={!swatches.length}
          onClick={() => copy(swatches.map((s) => s.hex).join("\n"))}
        >
          Copy all
        </button>
        <p className="note">Percentages are the share of sampled pixels each color accounts for.</p>
      </Group>
    </>
  );
}

function DataUriPanel({ doc, ops, format, quality }: PanelProps) {
  const { settings } = useSettings();
  const [maxEdge, setMaxEdge] = useState(256);
  const [result, setResult] = useState<{ uri: string; bytes: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Every change re-encodes the whole image to base64; debounce the slider.
  const opsKey = useDebounced(JSON.stringify(ops));
  const edge = useDebounced(maxEdge);
  const q = useDebounced(quality);

  useEffect(() => {
    let stale = false;
    dataUri(doc.id, JSON.parse(opsKey) as Operation[], format, q, edge, settings.matte)
      .then((r) => !stale && (setResult(r), setErr(null)))
      .catch((e) => !stale && (setResult(null), setErr(String(e))));
    return () => {
      stale = true;
    };
  }, [doc.id, opsKey, format, q, edge, settings.matte]);

  return (
    <>
      <Group title="Inline encoding">
        <Slider label="Max edge" value={maxEdge} min={16} max={1024} step={16} suffix="px" reset={256} onChange={setMaxEdge} />
        <p className="note">
          Format and quality come from the bar below. Base64 adds about a third to the byte count, so
          keep inlined images small.
        </p>
      </Group>
      <Group title="Result">
        {err && <p className="note note--err">{err}</p>}
        {result && (
          <>
            <dl className="readout readout--stack">
              <Row k="Encoded" v={`${(result.bytes / 1024).toFixed(1)} KB`} />
              <Row k="URI length" v={`${result.uri.length.toLocaleString()} ch`} />
            </dl>
            <textarea className="uribox" readOnly value={result.uri} spellCheck={false} onFocus={(e) => e.currentTarget.select()} />
            <button
              className="btn btn--primary"
              onClick={() => {
                void navigator.clipboard.writeText(result.uri);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              }}
            >
              {copied ? "Copied" : "Copy data URI"}
            </button>
          </>
        )}
      </Group>
    </>
  );
}

// ── Shared bits ────────────────────────────────────────────────────────

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="group">
      {title && <h2 className="group__title">{title}</h2>}
      {children}
    </section>
  );
}

function Row({ k, v, truncate }: { k: string; v: string; truncate?: boolean }) {
  return (
    <div>
      <dt>{k}</dt>
      <dd className={truncate ? "truncate" : undefined}>{v}</dd>
    </div>
  );
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <div className="row">
      <button className={`btn ${on ? "btn--active" : ""}`} onClick={onClick} aria-pressed={on}>
        {label}
      </button>
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="numfield">
      <span className="label">{label}</span>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
