import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { open, message } from "@tauri-apps/plugin-dialog";

import { CanvasView, type CanvasViewport } from "./CanvasView";
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
import {
  buildOps,
  INITIAL_EDIT,
  isDirty,
  type EditState,
  type Operation,
} from "../lib/ops";
import { toolById, type ToolId } from "../tools/registry";

interface Props {
  tool: ToolId;
  doc: DocMeta | null;
  viewport: CanvasViewport;
  setViewport: Dispatch<SetStateAction<CanvasViewport>>;
  edit: EditState;
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

function useOutputSize(doc: DocMeta | null, ops: Operation[]) {
  const id = doc?.id;
  const key = JSON.stringify(ops);
  const [result, setResult] = useState<{
    id: number;
    key: string;
    size: [number, number] | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (id === undefined || key === "[]") return;
    let stale = false;
    outputSize(id, JSON.parse(key)).then(
      (size) => !stale && setResult({ id, key, size, error: null }),
      (error) => !stale && setResult({ id, key, size: null, error: String(error) }),
    );
    return () => {
      stale = true;
    };
  }, [id, key]);

  if (doc && key === "[]") {
    return { size: [doc.width, doc.height] as [number, number], error: null };
  }
  return result && result.id === id && result.key === key
    ? result
    : { size: null, error: null };
}

export function Workspace(p: Props) {
  const { doc, edit, tool: toolId } = p;
  const tool = toolById(toolId);

  const [faviconBusy, setBusy] = useState(false);
  const busy = faviconBusy || p.exporting;

  /** Each field name becomes its own coalesce group, so a slider drag is one undo step. */
  const patch = useCallback(
    (delta: Partial<EditState>) => {
      p.history.set((e) => ({ ...e, ...delta }), Object.keys(delta).join(","));
    },
    [p],
  );

  const pickFile = p.onPickFile;

  const cropping = toolId === "crop";
  const stage = cropping ? "crop" : toolId === "resize" ? "resize" : null;
  const ops = useMemo(() => buildOps(edit), [edit]);
  // Crop coordinates refer to the oriented input, before any later geometry.
  const stageOps = useMemo(
    () => (stage ? buildOps(edit, stage) : []),
    [edit, stage],
  );
  const previewOps = cropping ? stageOps : ops;
  const { url, rendering, error } = usePreview(doc?.id ?? null, previewOps);
  const { size } = useOutputSize(doc, ops);
  const input = useOutputSize(stage ? doc : null, stageOps);

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
    <div
      className="workspace"
      onPointerDownCapture={p.history.endGroup}
      onClickCapture={(event) => {
        if (event.target instanceof Element && event.target.closest("button"))
          p.history.endGroup();
      }}
    >
      <div className="workspace__canvas">
        <CanvasView
          url={url}
          rendering={rendering}
          pixelSize={cropping ? input.size : size}
          viewport={p.viewport}
          setViewport={p.setViewport}
          cropMode={cropping && !rendering && !error}
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
          resizeInputSize={input.size}
          resizeInputError={input.error}
          onFavicon={onFavicon}
          faviconFiles={p.faviconFiles}
          busy={busy}
        />
      </aside>

      <ExportBar
        doc={doc}
        mayHaveTransparency={doc.hasAlpha || edit.colorKey !== null}
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
        onReset={() => p.history.set(INITIAL_EDIT)}
        onOpen={pickFile}
        onCloseDoc={p.onCloseDoc}
      />
    </div>
  );
}
