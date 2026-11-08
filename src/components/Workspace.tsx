import { useCallback, useEffect, useMemo, useState } from "react";
import { open, message } from "@tauri-apps/plugin-dialog";

import { CanvasView } from "./CanvasView";
import { ExportBar } from "./ExportBar";
import { ToolPanel } from "./ToolPanel";
import { ToolIcon } from "./ToolIcon";
import { usePreview } from "../hooks/usePreview";
import type { History } from "../hooks/useHistory";
import {
  exportFavicon,
  outputSize,
  type DocMeta,
  type OutputFormat,
} from "../lib/api";
import { buildOps, INITIAL_EDIT, isDirty, type EditState } from "../lib/ops";
import { toolById, type ToolId } from "../tools/registry";

interface Props {
  tool: ToolId;
  doc: DocMeta | null;
  edit: EditState;
  setEdit: (
    next: EditState | ((p: EditState) => EditState),
    coalesceKey?: string,
  ) => void;
  history: History<EditState>;
  onPickFile: () => Promise<void>;
  onCloseDoc: () => void;
  onExport: () => Promise<void>;
  exporting: boolean;
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

export function Workspace(p: Props) {
  const { doc, edit, tool: toolId } = p;
  const tool = toolById(toolId);

  const [faviconBusy, setBusy] = useState(false);
  const busy = faviconBusy || p.exporting;
  const [size, setSize] = useState<[number, number] | null>(null);

  /** Each field name becomes its own coalesce group, so a slider drag is one undo step. */
  const patch = useCallback(
    (delta: Partial<EditState>) => {
      p.setEdit((e) => ({ ...e, ...delta }), Object.keys(delta).join(","));
    },
    [p],
  );

  const pickFile = p.onPickFile;

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

  const onFavicon = useCallback(async () => {
    if (!doc) return;
    const dir = await open({
      directory: true,
      title: "Where should the favicon set go?",
    });
    if (typeof dir !== "string") return;

    setBusy(true);
    try {
      p.setFaviconFiles(await exportFavicon(doc.id, ops, dir));
    } catch (e) {
      await message(String(e), {
        title: "Favicon generation failed",
        kind: "error",
      });
    } finally {
      setBusy(false);
    }
  }, [doc, ops, p]);

  if (!doc) {
    return (
      <div className="workspace workspace--empty">
        <div className="placeholder">
          <span
            className={`placeholder__glyph tool-card__icon--${tool.category}`}
          >
            <ToolIcon name={toolId} size={32} />
          </span>
          <span className="placeholder__category">{tool.category}</span>
          <h1>{tool.name}</h1>
          <p>{tool.blurb}</p>
          <button className="btn btn--primary btn--lg" onClick={pickFile}>
            <ToolIcon name="image" size={18} />
            Open an image
          </button>
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
        {rendering && (
          <div className="preview-status" role="status">
            Rendering preview…
          </div>
        )}
        {error && (
          <div className="toast toast--error" role="alert">
            {error}
          </div>
        )}
      </div>

      <aside className="panel">
        <header className="panel__head">
          <span className={`panel__icon tool-card__icon--${tool.category}`}>
            <ToolIcon name={toolId} size={22} />
          </span>
          <div>
            <h1>{tool.name}</h1>
            <p>{tool.blurb}</p>
          </div>
        </header>
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
        onExport={p.onExport}
        onReset={() => p.setEdit(INITIAL_EDIT)}
        onOpen={pickFile}
        onCloseDoc={p.onCloseDoc}
      />
    </div>
  );
}
