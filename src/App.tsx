import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, save, message } from "@tauri-apps/plugin-dialog";

import { Home } from "./components/Home";
import { BatchWorkspace } from "./components/BatchWorkspace";
import { SettingsModal } from "./components/SettingsModal";
import { TitleBar } from "./components/TitleBar";
import { Workspace } from "./components/Workspace";
import { Sidebar } from "./components/Sidebar";
import { ContextMenu, type MenuItem } from "./components/Menu";
import { FIT_VIEWPORT } from "./components/CanvasView";
import { useBatchQueue } from "./hooks/useBatchQueue";
import { useHistory } from "./hooks/useHistory";
import { useShellGuards } from "./hooks/useShellGuards";
import {
  closeImage,
  exportImage,
  openImage,
  supportedFormats,
  type DocMeta,
  type OutputFormat,
} from "./lib/api";
import { buildOps, isDirty, INITIAL_EDIT, type EditState } from "./lib/ops";
import { readRecovery, writeRecovery, type RecoveryDraft } from "./lib/recovery";
import { useSettings } from "./state/settings";
import type { CategoryId, ToolId } from "./tools/registry";

const HOME = "home";

/** Dropping a file on the home screen has to land somewhere. */
const DEFAULT_DROP_TOOL: ToolId = "crop";

export default function App() {
  useShellGuards();
  const { settings, set } = useSettings();

  // One document and one edit pipeline, shared by every tab. Tabs are *views*
  // onto the same image — crop in one, resize in another, and the operations
  // compose. Giving each tab its own copy would make composition impossible.
  const [source, setSource] = useState<{ path: string; doc: DocMeta } | null>(null);
  const doc = source?.doc ?? null;
  const history = useHistory<EditState>(INITIAL_EDIT);
  const { reset, set: setEdit } = history;
  const edit = history.present;
  const [exportedEdit, setExportedEdit] = useState(INITIAL_EDIT);
  const unfinished = doc !== null && JSON.stringify(edit) !== JSON.stringify(exportedEdit);
  const [recovery, setRecovery] = useState(readRecovery);
  const [viewport, setViewport] = useState(FIT_VIEWPORT);

  const [openTools, setOpenTools] = useState<ToolId[]>([]);
  const [active, setActive] = useState<string>(HOME);
  const batch = useBatchQueue();
  const { addFiles: addBatchFiles, pickFiles: pickBatchFiles, running: batchRunning } = batch;
  const batchActive = active === "batch";
  const [category, setCategory] = useState<CategoryId | "all">("all");
  const [exporting, setExporting] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const fileAction = useRef(false);

  const [formats, setFormats] = useState<OutputFormat[]>(["png"]);
  const [format, setFormat] = useState<OutputFormat>(settings.defaultFormat);
  const [quality, setQuality] = useState(settings.defaultQuality);
  const [aspect, setAspect] = useState<number | null>(null);
  const [linked, setLinked] = useState(true);
  const [faviconFiles, setFaviconFiles] = useState<string[]>([]);

  const [showSettings, setShowSettings] = useState(false);
  const [dropping, setDropping] = useState(false);

  useEffect(() => {
    supportedFormats().then(setFormats);
  }, []);

  useLayoutEffect(() => {
    if (!source) return;
    const { name, width, height } = source.doc;
    writeRecovery(unfinished ? {
      version: 1, path: source.path, image: { name, width, height }, edit, format, quality,
    } : null);
  }, [source, unfinished, edit, format, quality]);

  const runFileAction = useCallback(async <T,>(title: string, action: () => Promise<T>) => {
    if (fileAction.current) return;
    fileAction.current = true;
    setFileBusy(true);
    try {
      return await action();
    } catch (error) {
      await message(String(error), { title, kind: "error" });
    } finally {
      fileAction.current = false;
      setFileBusy(false);
    }
  }, []);

  const resetDocument = useCallback(() => {
    reset(INITIAL_EDIT);
    setExportedEdit(INITIAL_EDIT);
    setFaviconFiles([]);
    setViewport(FIT_VIEWPORT);
  }, [reset]);

  const load = useCallback(
    async (path: string, draft?: RecoveryDraft) => {
      const next = await openImage(path);
      if (draft && (draft.image.width !== next.width || draft.image.height !== next.height)) {
        await closeImage(next.id);
        throw new Error("The source image dimensions changed. The recovery draft is still available.");
      }
      if (doc) void closeImage(doc.id).catch(console.error);
      setSource({ path, doc: next });
      resetDocument();
      if (draft) {
        setEdit(draft.edit);
        setFormat(draft.format);
        setQuality(draft.quality);
      }
      setRecovery(null);
    },
    [doc, resetDocument, setEdit],
  );

  const openTool = useCallback((tool: ToolId) => {
    setOpenTools((ts) => (ts.includes(tool) ? ts : [...ts, tool]));
    setActive(tool);
  }, []);

  const closeTab = useCallback((tool: string) => {
    setOpenTools((ts) => {
      const rest = ts.filter((t) => t !== tool);
      setActive((cur) => {
        if (cur !== tool) return cur;
        const i = ts.indexOf(tool as ToolId);
        return rest[i - 1] ?? rest[i] ?? HOME;
      });
      return rest;
    });
  }, []);

  const exportCurrent = useCallback(async () => {
    if (!doc) return false;
    try {
      const base = doc.name.replace(/\.[^.]+$/, "");
      const path = await save({
        defaultPath: `${base}-edited.${format}`,
        filters: [{ name: format.toUpperCase(), extensions: [format] }],
      });
      if (!path) return false;
      setExporting(true);
      await exportImage(
        doc.id,
        buildOps(edit),
        path,
        format,
        quality,
        settings.matte,
      );
      setExportedEdit(edit);
      return true;
    } catch (e) {
      await message(String(e), { title: "Export failed", kind: "error" });
      return false;
    } finally {
      setExporting(false);
    }
  }, [doc, edit, format, quality, settings.matte]);

  const onExport = useCallback(async () => {
    await runFileAction("Export failed", exportCurrent);
  }, [runFileAction, exportCurrent]);

  const confirmLeave = useCallback(async () => {
    if (!unfinished || !doc) return true;
    const choice = await message(`Export an edited copy of ${doc.name} before leaving?`, {
      title: "Unfinished edits",
      kind: "warning",
      buttons: { yes: "Export", no: "Discard", cancel: "Cancel" },
    });
    return choice === "Discard" || (choice === "Export" && await exportCurrent());
  }, [unfinished, doc, exportCurrent]);

  const closeDoc = useCallback(() => {
    void runFileAction("Could not close image", async () => {
      if (!doc || !(await confirmLeave())) return;
      await closeImage(doc.id);
      writeRecovery(null);
      setSource(null);
      resetDocument();
    });
  }, [doc, runFileAction, confirmLeave, resetDocument]);

  const confirmWindowClose = useRef<() => Promise<boolean>>(async () => false);
  useLayoutEffect(() => {
    confirmWindowClose.current = async () => (
      await runFileAction("Could not close OpenImages", async () => {
        if (batchRunning) {
          await message("Wait for Batch Export to finish or stop it before closing OpenImages.", {
            title: "Batch export in progress",
            kind: "warning",
          });
          return false;
        }
        if (!(await confirmLeave())) return false;
        if (doc) writeRecovery(null);
        return true;
      })
    ) === true;
  }, [runFileAction, confirmLeave, doc, batchRunning]);

  useEffect(() => {
    const unlisten = getCurrentWindow().onCloseRequested(async (event) => {
      if (!(await confirmWindowClose.current())) event.preventDefault();
    });
    return () => void unlisten.then((stop) => stop());
  }, []);

  const recover = useCallback(() => {
    if (!recovery) return;
    void runFileAction("Could not restore edits", async () => {
      const choice = await message(`Restore the unfinished edits to ${recovery.image.name}?`, {
        title: "Recover unfinished edits",
        buttons: { yes: "Restore", no: "Discard", cancel: "Later" },
      });
      if (choice === "Discard") {
        writeRecovery(null);
        setRecovery(null);
      } else if (choice === "Restore") {
        await load(recovery.path, recovery);
        openTool(DEFAULT_DROP_TOOL);
      }
    });
  }, [recovery, runFileAction, load, openTool]);

  const recoveryPrompted = useRef(false);
  useEffect(() => {
    if (!recovery || recoveryPrompted.current) return;
    recoveryPrompted.current = true;
    recover();
  }, [recovery, recover]);

  const replaceImage = useCallback(async (path: string) => {
    if (recovery) {
      const choice = await message(`Opening another image will replace the recovery draft for ${recovery.image.name}.`, {
        title: "Recovery draft available",
        kind: "warning",
        buttons: { ok: "Discard draft", cancel: "Cancel" },
      });
      if (choice !== "Discard draft") return;
    }
    if (!(await confirmLeave())) return;
    await load(path);
    if (active === HOME) openTool(DEFAULT_DROP_TOOL);
  }, [recovery, confirmLeave, load, active, openTool]);

  const pickFile = useCallback(async () => {
    if (batchActive) {
      await runFileAction("Could not add images", pickBatchFiles);
      return;
    }
    await runFileAction("Could not open image", async () => {
      const path = await open({
        multiple: false,
        filters: [{
          name: "Images",
          extensions: ["png", "jpg", "jpeg", "webp", "bmp", "tiff", "tif", "gif", "ico", "avif"],
        }],
      });
      if (typeof path === "string") await replaceImage(path);
    });
  }, [batchActive, pickBatchFiles, runFileAction, replaceImage]);

  const selectCategory = (next: CategoryId | "all") => {
    setCategory(next);
    setActive(HOME);
  };

  // Tauri delivers OS file drops through the webview, not HTML drag events.
  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((e) => {
      if (e.payload.type === "over") {
        return setDropping(!fileAction.current && !(batchActive && batchRunning));
      }
      if (e.payload.type === "leave") return setDropping(false);
      if (e.payload.type !== "drop") return;

      setDropping(false);
      if (fileAction.current) return;
      if (batchActive) {
        addBatchFiles(e.payload.paths);
        return;
      }
      const path = e.payload.paths[0];
      if (!path) return;
      void runFileAction("Could not open image", () => replaceImage(path));
    });
    return () => void unlisten.then((f) => f());
  }, [addBatchFiles, batchActive, batchRunning, runFileAction, replaceImage]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.defaultPrevented || showSettings || fileAction.current) return;
      if (
        ["z", "y"].includes(e.key.toLowerCase()) &&
        e.target instanceof HTMLElement &&
        e.target.closest(
          'input:not([type="range"]), textarea, [contenteditable]:not([contenteditable="false"])',
        )
      )
        return;

      // Ctrl+Z / Ctrl+Shift+Z (and Ctrl+Y, which Windows users reach for).
      if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? history.redo() : history.undo();
      } else if (e.key.toLowerCase() === "y") {
        e.preventDefault();
        history.redo();
      } else if (e.key.toLowerCase() === "o") {
        e.preventDefault();
        void pickFile();
      } else if (e.key.toLowerCase() === "s" && doc && !batchActive) {
        e.preventDefault();
        void onExport();
      } else if (e.key === ",") {
        e.preventDefault();
        setShowSettings(true);
      } else if (e.key.toLowerCase() === "w" && active !== HOME) {
        e.preventDefault();
        closeTab(active);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history, active, batchActive, closeTab, pickFile, doc, onExport, showSettings]);

  const tabs = useMemo(
    () => [
      { id: HOME, toolId: null, docName: null },
      ...openTools.map((t) => ({
        id: t,
        toolId: t,
        docName: t === "batch" ? null : (doc?.name ?? null),
      })),
    ],
    [openTools, doc],
  );

  const fileItems: MenuItem[] = [
    {
      label: batchActive ? "Add images…" : "Open image…",
      shortcut: "Ctrl O",
      disabled: batchActive && batchRunning,
      onSelect: () => void pickFile(),
    },
    {
      label: exporting ? "Exporting…" : "Export image…",
      shortcut: "Ctrl S",
      disabled: !doc || exporting || batchActive,
      onSelect: () => void onExport(),
    },
    { label: "Close image", disabled: !doc || exporting, onSelect: closeDoc },
    {
      label: "Settings…",
      shortcut: "Ctrl ,",
      onSelect: () => setShowSettings(true),
    },
    ...(recovery ? [{ label: "Recover unfinished edits…", onSelect: recover }] : []),
  ];
  const editItems: MenuItem[] = [
    {
      label: "Undo",
      shortcut: "Ctrl Z",
      disabled: !history.canUndo || exporting,
      onSelect: history.undo,
    },
    {
      label: "Redo",
      shortcut: "Ctrl Shift Z",
      disabled: !history.canRedo || exporting,
      onSelect: history.redo,
    },
    {
      label: "Reset edits",
      disabled: !doc || !isDirty(edit) || exporting,
      onSelect: () => history.set(INITIAL_EDIT),
    },
  ];
  const menus = [
    { label: "File", items: fileItems },
    { label: "Edit", items: editItems },
    {
      label: "View",
      items: [
        { label: "All tools", onSelect: () => selectCategory("all") },
        {
          label: "Light appearance",
          checked: settings.theme === "light",
          onSelect: () => set("theme", "light"),
        },
        {
          label: "Dark appearance",
          checked: settings.theme === "dark",
          onSelect: () => set("theme", "dark"),
        },
        {
          label: "Transparency grid",
          checked: settings.checkerboard,
          onSelect: () => set("checkerboard", !settings.checkerboard),
        },
      ],
    },
  ];

  return (
    <ContextMenu items={[...fileItems.slice(0, 2), ...editItems, fileItems[3]]}>
      <div className={`app ${dropping ? "is-dropping" : ""}`} inert={fileBusy}>
        <TitleBar
          onHome={() => setActive(HOME)}
          menus={menus}
          tabs={tabs}
          activeId={active}
          onSelect={setActive}
          onClose={closeTab}
          reduceMotion={settings.reduceMotion}
        />

        <Sidebar
          category={active === HOME ? category : null}
          onCategoryChange={selectCategory}
          onSettings={() => setShowSettings(true)}
        />
        <div className="foreground">
          <main className="stagearea" key={active}>
            {active === HOME ? (
              <Home
                onOpen={openTool}
                onPickFile={pickFile}
                category={category}
                onCategoryChange={selectCategory}
              />
            ) : batchActive ? (
              <BatchWorkspace batch={batch} formats={formats} doc={doc} edit={edit} />
            ) : (
              <Workspace
                tool={active as ToolId}
                doc={doc}
                viewport={viewport}
                setViewport={setViewport}
                edit={edit}
                history={history}
                onPickFile={pickFile}
                onCloseDoc={closeDoc}
                onExport={onExport}
                exporting={exporting}
                formats={formats}
                format={format}
                setFormat={setFormat}
                quality={quality}
                setQuality={setQuality}
                aspect={aspect}
                setAspect={setAspect}
                linked={linked}
                setLinked={setLinked}
                faviconFiles={faviconFiles}
                setFaviconFiles={setFaviconFiles}
              />
            )}
          </main>
        </div>

        {showSettings && (
          <SettingsModal
            formats={formats}
            onClose={() => setShowSettings(false)}
          />
        )}

        <div className="dropveil" aria-hidden={!dropping}>
          <span>{batchActive ? "Drop to add to batch" : "Drop to open"}</span>
        </div>
      </div>
    </ContextMenu>
  );
}
