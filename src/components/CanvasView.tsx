import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { CropRect } from "../lib/ops";

type Handle = "nw" | "n" | "ne" | "w" | "e" | "sw" | "s" | "se";
const HANDLES: Handle[] = ["nw", "n", "ne", "w", "e", "sw", "s", "se"];

/** What a pointer-down started. */
type Drag =
  | { mode: "new"; ox: number; oy: number }
  | { mode: "move"; ox: number; oy: number; start: CropRect }
  | { mode: "resize"; handle: Handle; start: CropRect }
  | { mode: "pan"; ox: number; oy: number; start: { x: number; y: number } };

export interface CanvasViewport {
  zoom: number;
  pan: { x: number; y: number };
}

export const FIT_VIEWPORT: CanvasViewport = { zoom: 1, pan: { x: 0, y: 0 } };

interface Props {
  url: string | null;
  rendering: boolean;
  pixelSize: [number, number] | null;
  viewport: CanvasViewport;
  setViewport: Dispatch<SetStateAction<CanvasViewport>>;
  cropMode: boolean;
  crop: CropRect | null;
  aspect: number | null;
  onCrop: (r: CropRect | null) => void;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 32;
/** Below this a drag reads as a click, not a rectangle. */
const MIN_RECT = 0.004;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));

export function CanvasView({
  url,
  rendering,
  pixelSize,
  viewport: { zoom, pan },
  setViewport,
  cropMode,
  crop,
  aspect,
  onCrop,
}: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [spaceHeld, setSpaceHeld] = useState(false);
  const drag = useRef<Drag | null>(null);

  const fit = useCallback(() => setViewport(FIT_VIEWPORT), [setViewport]);

  /** Zoom where one image pixel covers one screen pixel. */
  const actualSize = useCallback(() => {
    const img = imgRef.current;
    if (!img?.clientWidth || !pixelSize || rendering) return;
    // Layout size is the fitted size; the transform scales on top of it.
    setViewport({
      zoom: clamp(pixelSize[0] / img.clientWidth, MIN_ZOOM, MAX_ZOOM),
      pan: FIT_VIEWPORT.pan,
    });
  }, [pixelSize, rendering, setViewport]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        (e.target instanceof HTMLElement &&
          e.target.closest(
            "input, textarea, button, [role=menu], [role=listbox], [contenteditable], dialog",
          ))
      )
        return;
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        setSpaceHeld(true);
      }
      if (e.key === "0" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        fit();
      }
      if (e.key === "1" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        actualSize();
      }
    };
    const up = (e: KeyboardEvent) => e.code === "Space" && setSpaceHeld(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [fit, actualSize]);

  /** Keep the point under the cursor pinned while the scale changes. */
  const zoomAt = useCallback(
    (factor: number, clientX?: number, clientY?: number) => {
      const box = canvasRef.current?.getBoundingClientRect();
      setViewport(({ zoom, pan }) => {
        const next = clamp(zoom * factor, MIN_ZOOM, MAX_ZOOM);
        if (box && clientX !== undefined && clientY !== undefined) {
          // Transform origin is the canvas center, so measure the cursor from there.
          const cx = clientX - (box.left + box.width / 2);
          const cy = clientY - (box.top + box.height / 2);
          const k = next / zoom;
          return {
            zoom: next,
            pan: { x: cx - (cx - pan.x) * k, y: cy - (cy - pan.y) * k },
          };
        }
        return { zoom: next, pan };
      });
    },
    [setViewport],
  );

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY);
  };

  /** Pointer position as a fraction of the rendered image box. */
  const toNorm = (e: React.PointerEvent) => {
    const box = imgRef.current?.getBoundingClientRect();
    if (!box?.width || !box.height) return null;
    return {
      x: clamp01((e.clientX - box.left) / box.width),
      y: clamp01((e.clientY - box.top) / box.height),
      box,
    };
  };

  const startPan = (e: React.PointerEvent) => {
    drag.current = { mode: "pan", ox: e.clientX, oy: e.clientY, start: pan };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // Middle-drag or space-drag always pans, whatever the tool.
    if (e.button === 1 || spaceHeld) {
      e.preventDefault();
      return startPan(e);
    }
    if (e.button !== 0) return;
    if (!cropMode) return startPan(e);

    const point = toNorm(e);
    if (!point) return;
    const handle = (e.target as HTMLElement).dataset.handle as
      | Handle
      | undefined;
    e.currentTarget.setPointerCapture(e.pointerId);

    if (handle && crop) {
      drag.current = { mode: "resize", handle, start: crop };
      return;
    }

    const { x, y } = point;
    const inside =
      crop &&
      x >= crop.x &&
      x <= crop.x + crop.width &&
      y >= crop.y &&
      y <= crop.y + crop.height;

    if (inside && crop) {
      drag.current = { mode: "move", ox: x, oy: y, start: crop };
    } else {
      drag.current = { mode: "new", ox: x, oy: y };
      onCrop(null);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;

    if (d.mode === "pan") {
      const next = {
        x: d.start.x + (e.clientX - d.ox),
        y: d.start.y + (e.clientY - d.oy),
      };
      setViewport((view) => ({ ...view, pan: next }));
      return;
    }
    if (!cropMode) return;
    const point = toNorm(e);
    if (!point) return;
    const { x, y, box } = point;
    const imageBounds = pixelSize
      ? { width: pixelSize[0], height: pixelSize[1] }
      : box;

    if (d.mode === "new") {
      onCrop(rectFromCorners(d.ox, d.oy, x, y, aspect, imageBounds));
    } else if (d.mode === "move") {
      // Shift the whole rect, clamping so it can't leave the image.
      const dx = clamp(x - d.ox, -d.start.x, 1 - d.start.x - d.start.width);
      const dy = clamp(y - d.oy, -d.start.y, 1 - d.start.y - d.start.height);
      onCrop({ ...d.start, x: d.start.x + dx, y: d.start.y + dy });
    } else {
      onCrop(resizeRect(d.start, d.handle, x, y, aspect, imageBounds));
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    // A click without a drag reads as "clear the selection", not a 0×0 crop.
    if (
      d &&
      d.mode === "new" &&
      crop &&
      (crop.width < MIN_RECT || crop.height < MIN_RECT)
    ) {
      onCrop(null);
    }
  };

  if (!url) return <div className="canvas canvas--empty" ref={canvasRef} />;

  const panning = drag.current?.mode === "pan";
  const cursor =
    spaceHeld || panning ? "grabbing" : cropMode ? "crosshair" : "grab";

  return (
    <div className="canvas" ref={canvasRef} onWheel={onWheel}>
      <div
        className="viewport"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          cursor,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className={`stage ${rendering ? "is-rendering" : ""}`}>
          <img
            ref={imgRef}
            src={url}
            alt="preview"
            draggable={false}
            // Above 2x the user is inspecting pixels, not judging resampling.
            style={{ imageRendering: zoom > 2 ? "pixelated" : "auto" }}
          />

          {cropMode && (
            <div className="cropper">
              {crop ? (
                <>
                  {/* Four dimming panels around the selection beat one big overlay
                      with a hole — no clip-path, no z-index games. */}
                  <div
                    className="shade"
                    style={{ inset: `0 0 ${(1 - crop.y) * 100}% 0` }}
                  />
                  <div
                    className="shade"
                    style={{ inset: `${(crop.y + crop.height) * 100}% 0 0 0` }}
                  />
                  <div
                    className="shade"
                    style={{
                      inset: `${crop.y * 100}% ${(1 - crop.x) * 100}% ${(1 - crop.y - crop.height) * 100}% 0`,
                    }}
                  />
                  <div
                    className="shade"
                    style={{
                      inset: `${crop.y * 100}% 0 ${(1 - crop.y - crop.height) * 100}% ${(crop.x + crop.width) * 100}%`,
                    }}
                  />
                  <div
                    className="crop-rect"
                    style={{
                      left: `${crop.x * 100}%`,
                      top: `${crop.y * 100}%`,
                      width: `${crop.width * 100}%`,
                      height: `${crop.height * 100}%`,
                    }}
                  >
                    <span className="crop-rect__grid" />
                    {HANDLES.map((h) => (
                      <span
                        key={h}
                        data-handle={h}
                        className={`crop-handle crop-handle--${h}`}
                        // Handles must stay grabbable when the image is zoomed out.
                        style={{
                          transform: `translate(-50%, -50%) scale(${1 / zoom})`,
                        }}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <div className="cropper__hint">
                  <span>Drag to select a region</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="zoombar">
        <button
          className="zoombar__btn"
          onClick={() => zoomAt(1 / 1.25)}
          aria-label="Zoom out"
        >
          −
        </button>
        <button className="zoombar__pct" onClick={fit} title="Fit (Ctrl+0)">
          {Math.round(zoom * 100)}%
        </button>
        <button
          className="zoombar__btn"
          onClick={() => zoomAt(1.25)}
          aria-label="Zoom in"
        >
          +
        </button>
        <span className="zoombar__sep" />
        <button className="zoombar__btn zoombar__btn--wide" onClick={fit}>
          Fit
        </button>
        <button
          className="zoombar__btn zoombar__btn--wide"
          onClick={actualSize}
          disabled={!pixelSize || rendering}
          title="Ctrl+1"
        >
          1:1
        </button>
      </div>
    </div>
  );
}

/** Aspect is a ratio of pixels, but x/y are fractions of differently sized axes. */
type ImageBounds = Pick<DOMRect, "width" | "height">;

function applyAspect(w: number, h: number, aspect: number, box: ImageBounds) {
  const wPx = w * box.width;
  const hPx = h * box.height;
  if (wPx / Math.max(hPx, 1e-6) > aspect)
    return { w: (hPx * aspect) / box.width, h };
  return { w, h: wPx / aspect / box.height };
}

function rectFromCorners(
  ox: number,
  oy: number,
  x: number,
  y: number,
  aspect: number | null,
  box: ImageBounds,
): CropRect {
  let w = Math.abs(x - ox);
  let h = Math.abs(y - oy);
  if (aspect) ({ w, h } = applyAspect(w, h, aspect, box));

  const left = x < ox ? ox - w : ox;
  const top = y < oy ? oy - h : oy;
  return {
    x: clamp01(left),
    y: clamp01(top),
    width: Math.min(w, 1 - clamp01(left)),
    height: Math.min(h, 1 - clamp01(top)),
  };
}

/**
 * Resize by dragging one handle. The opposite edge stays pinned, so we express
 * the rect as two edges, move the ones this handle owns, then re-normalize —
 * which also makes dragging a handle past its opposite edge flip cleanly.
 */
function resizeRect(
  start: CropRect,
  handle: Handle,
  x: number,
  y: number,
  aspect: number | null,
  box: ImageBounds,
): CropRect {
  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;

  if (handle.includes("w")) left = x;
  if (handle.includes("e")) right = x;
  if (handle.includes("n")) top = y;
  if (handle.includes("s")) bottom = y;

  let nx = clamp01(Math.min(left, right));
  let ny = clamp01(Math.min(top, bottom));
  let w = clamp01(Math.abs(right - left));
  let h = clamp01(Math.abs(bottom - top));

  if (aspect) {
    ({ w, h } = applyAspect(w, h, aspect, box));
    // Keep the anchored corner still: only west/north edges move the origin.
    if (handle.includes("w")) nx = clamp01(start.x + start.width - w);
    if (handle.includes("n")) ny = clamp01(start.y + start.height - h);
  }

  return {
    x: nx,
    y: ny,
    width: Math.min(w, 1 - nx),
    height: Math.min(h, 1 - ny),
  };
}
