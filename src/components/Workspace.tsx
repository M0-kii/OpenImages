import { useCallback, useEffect, useMemo, useState } from "react";
import { open, save, message } from "@tauri-apps/plugin-dialog";

import { CanvasView } from "./CanvasView";
import { ExportBar } from "./ExportBar";
import { ToolPanel } from "./ToolPanel";
import { usePreview } from "../hooks/usePreview";
import type { History } from "../hooks/useHistory";
import {
  exportFavicon,
  exportImage,
  outputSize,
  type DocMeta,
  type OutputFormat,
} from "../lib/api";
import { buildOps, INITIAL_EDIT, isDirty, type EditState } from "../lib/ops";
import { useSettings } from "../state/settings";
import { toolById, type ToolId } from "../tools/registry";

interface Props {
  tool: ToolId;
  doc: DocMeta | null;
  edit: EditState;
  setEdit: (next: EditState | ((p: EditState) => EditState), coalesceKey?: string) => void;
  history: History<EditState>;
  onLoad: (path: string) => Promise<void>;
  onCloseDoc: () => void;
  formats: OutputFormat[];
  format: OutputFormat;
  setFormat: (f: OutputFormat) => void;
  quality: number;
  setQuality: (q: number) => void;
  aspect: number | null;
  setAspect: (a: number | null) => void;
  linked: boolean;
  setLinked: (v: boolean) => void;
  faviconFiles: string[];
  setFaviconFiles: (f: string[]) => void;
}

const EXTENSIONS = ["png", "jpg", "jpeg", "webp", "bmp", "tiff", "tif", "gif", "ico", "avif"];

export function Workspace(p: Props) {
  const { doc, edit, tool: toolId } = p;
  const tool = toolById(toolId);
  const { settings } = useSettings();

  const [busy, setBusy] = useState(false);
  const [size, setSize] = useState<[number, number] | null>(null);

  /** Each field name becomes its own coalesce group, so a slider drag is one undo step. */
  const patch = useCallback(
    (delta: Partial<EditState>) => {
      p.setEdit((e) => ({ ...e, ...delta }), Object.keys(delta).join(","));
    },
    [p],
  );

  const pickFile = useCallback(async () => {
    const path = await open({ multiple: false, filters: [{ name: "Images", extensions: EXTENSIONS }] });
    if (typeof path === "string") await p.onLoad(path);
  }, [p]);

  // The crop tool is *always* cropping, so the preview must render uncropped —
  // you can't drag a rectangle around a region the preview has already removed.
  const cropping = toolId === "crop";
  const previewOps = useMemo(
    () => buildOps(cropping ? { ...edit, crop: null } : edit),
    [edit, cropping],
  );
  const { url, rendering, error } = usePreview(doc?.id ?? null, previewOps);

  const ops = useMemo(() => buildOps(edit), [edit]);
  const opsKey = JSON.stringify(ops);

  useEffect(() => {
    if (!doc) {
      setSize(null);
      return;
    }
    let stale = false;
    outputSize(doc.id, JSON.parse(opsKey)).then((s) => !stale && setSize(s));
    return () => {
      stale = true;
    };
  }, [doc, opsKey]);

  const onExport = useCallback(async () => {
    if (!doc) return;
    const base = doc.name.replace(/\.[^.]+$/, "");
    const path = await save({
      defaultPath: `${base}-edited.${p.format}`,
      filters: [{ name: p.format.toUpperCase(), extensions: [p.format] }],
    });
    if (!path) return;

    setBusy(true);
    try {
      await exportImage(doc.id, ops, path, p.format, p.quality, settings.matte);
    } catch (e) {
      await message(String(e), { title: "Export failed", kind: "error" });
    } finally {
      setBusy(false);
    }
  }, [doc, ops, p.format, p.quality, settings.matte]);

  const onFavicon = useCallback(async () => {
    if (!doc) return;
    const dir = await open({ directory: true, title: "Where should the favicon set go?" });
    if (typeof dir !== "string") return;

    setBusy(true);
    try {
      p.setFaviconFiles(await exportFavicon(doc.id, ops, dir));
    } catch (e) {
      await message(String(e), { title: "Favicon generation failed", kind: "error" });
    } finally {
      setBusy(false);
    }
  }, [doc, ops, p]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "o") {
        e.preventDefault();
        void pickFile();
      } else if (mod && e.key.toLowerCase() === "s" && doc && tool.hasExport) {
        e.preventDefault();
        void onExport();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickFile, onExport, doc, tool.hasExport]);

  if (!doc) {
    return (
      <div className="workspace workspace--empty">
        <div className="placeholder">
          <span className="placeholder__glyph" aria-hidden>{tool.glyph}</span>
          <h2>{tool.name}</h2>
          <p>{tool.blurb}</p>
          <button className="btn btn--primary btn--lg" onClick={pickFile}>Open an image</button>
          <p className="placeholder__hint">
            or drop one here · <kbd>Ctrl</kbd>+<kbd>O</kbd>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="workspace">
      <div className="workspace__canvas">
        <CanvasView
          url={url}
          rendering={rendering}
          cropMode={cropping}
          crop={edit.crop}
          aspect={p.aspect}
          onCrop={(crop) => patch({ crop })}
        />
        {error && <div className="toast toast--error">{error}</div>}
      </div>

      <aside className="panel">
        <ToolPanel
          tool={toolId}
          doc={doc}
          edit={edit}
          patch={patch}
          ops={ops}
          format={p.format}
          quality={p.quality}
          aspect={p.aspect}
          setAspect={p.setAspect}
          linked={p.linked}
          setLinked={p.setLinked}
          onFavicon={onFavicon}
          faviconFiles={p.faviconFiles}
          busy={busy}
        />
      </aside>

      <ExportBar
        doc={doc}
        formats={p.formats}
        format={p.format}
        setFormat={p.setFormat}
        quality={p.quality}
        setQuality={p.setQuality}
        size={size}
        busy={busy}
        dirty={isDirty(edit)}
        showExport={tool.hasExport}
        showFormat={tool.hasExport || !!tool.needsFormat}
        canUndo={p.history.canUndo}
        canRedo={p.history.canRedo}
        onUndo={p.history.undo}
        onRedo={p.history.redo}
        onExport={onExport}
        onReset={() => p.setEdit(INITIAL_EDIT)}
        onOpen={pickFile}
        onCloseDoc={p.onCloseDoc}
      />
    </div>
  );
}
