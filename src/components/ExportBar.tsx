import { OPAQUE_FORMATS, type DocMeta, type OutputFormat } from "../lib/api";
import { toHex } from "../lib/ops";
import { useSettings } from "../state/settings";

interface Props {
  doc: DocMeta;
  formats: OutputFormat[];
  format: OutputFormat;
  setFormat: (f: OutputFormat) => void;
  quality: number;
  setQuality: (q: number) => void;
  size: [number, number] | null;
  busy: boolean;
  dirty: boolean;
  /** The favicon tool writes its own files; an Export button there is a lie. */
  showExport: boolean;
  /** Data URI needs format and quality without wanting an Export button. */
  showFormat: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  onReset: () => void;
  onOpen: () => void;
  onCloseDoc: () => void;
}

export function ExportBar(p: Props) {
  const { settings } = useSettings();
  const lossy = p.format === "jpeg";
  const opaque = OPAQUE_FORMATS.includes(p.format);
  const [w, h] = p.size ?? [p.doc.width, p.doc.height];
  const resized = w !== p.doc.width || h !== p.doc.height;

  return (
    <footer className="exportbar">
      <div className="exportbar__meta">
        <span className="filename" title={p.doc.name}>{p.doc.name}</span>
        <span className="dims">
          {p.doc.width}×{p.doc.height}
          {resized && (
            <>
              <span className="arrow">→</span>
              <em>{w}×{h}</em>
            </>
          )}
        </span>
        {p.doc.hasAlpha && opaque && p.showFormat && (
          <span className="warn" title={`${p.format.toUpperCase()} has no alpha channel`}>
            transparency → {toHex(settings.matte)}
          </span>
        )}
      </div>

      <div className="exportbar__controls">
        <div className="undogroup">
          <button className="iconbtn iconbtn--sm" onClick={p.onUndo} disabled={!p.canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
            <svg viewBox="0 0 16 16" aria-hidden>
              <path d="M6 4L2.5 7.5 6 11" />
              <path d="M2.5 7.5H10a3.5 3.5 0 010 7H7" />
            </svg>
          </button>
          <button className="iconbtn iconbtn--sm" onClick={p.onRedo} disabled={!p.canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
            <svg viewBox="0 0 16 16" aria-hidden>
              <path d="M10 4l3.5 3.5L10 11" />
              <path d="M13.5 7.5H6a3.5 3.5 0 000 7h3" />
            </svg>
          </button>
        </div>

        {p.showFormat && (
          <>
            <label className="field field--inline">
              <span className="label">Format</span>
              <select value={p.format} onChange={(e) => p.setFormat(e.target.value as OutputFormat)}>
                {p.formats.map((f) => (
                  <option key={f} value={f}>{f.toUpperCase()}</option>
                ))}
              </select>
            </label>

            {lossy && (
              <label className="field field--inline">
                <span className="label">Quality</span>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={p.quality}
                  style={{ ["--pct" as string]: `${p.quality}%` }}
                  onChange={(e) => p.setQuality(Number(e.target.value))}
                />
                <span className="qval">{p.quality}</span>
              </label>
            )}
          </>
        )}

        <button className="btn btn--ghost" onClick={p.onOpen}>Open…</button>
        <button className="btn btn--ghost" onClick={p.onReset} disabled={!p.dirty}>Reset</button>
        <button className="btn btn--ghost" onClick={p.onCloseDoc}>Close</button>
        {p.showExport && (
          <button className="btn btn--primary" onClick={p.onExport} disabled={p.busy}>
            {p.busy ? "Exporting…" : "Export"}
          </button>
        )}
      </div>
    </footer>
  );
}
