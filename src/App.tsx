import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open, save, message } from "@tauri-apps/plugin-dialog";

import { Home } from "./components/Home";
import { SettingsModal } from "./components/SettingsModal";
import { TitleBar } from "./components/TitleBar";
import { Workspace } from "./components/Workspace";
import { Sidebar } from "./components/Sidebar";
import { ContextMenu, type MenuItem } from "./components/Menu";
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
  const [doc, setDoc] = useState<DocMeta | null>(null);
  const history = useHistory<EditState>(INITIAL_EDIT);
  const edit = history.present;

  const [openTools, setOpenTools] = useState<ToolId[]>([]);
  const [active, setActive] = useState<string>(HOME);
  const [category, setCategory] = useState<CategoryId | "all">("all");
  const [exporting, setExporting] = useState(false);

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

  const openId = useRef<number | null>(null);

  const load = useCallback(
    async (path: string) => {
      try {
        const meta = await openImage(path);
        // Free the previous document *before* swapping, and outside any state
        // updater — StrictMode double-invokes those.
        if (openId.current !== null) void closeImage(openId.current);
        openId.current = meta.id;

        setDoc(meta);
        history.reset(INITIAL_EDIT);
        setFaviconFiles([]);
      } catch (e) {
        await message(String(e), {
          title: "Could not open image",
          kind: "error",
        });
      }
    },
    [history],
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

  const closeDoc = useCallback(() => {
    if (openId.current !== null) void closeImage(openId.current);
    openId.current = null;
    setDoc(null);
    history.reset(INITIAL_EDIT);
    setFaviconFiles([]);
  }, [history]);

  const pickFile = useCallback(async () => {
    const path = await open({
      multiple: false,
      filters: [
        {
          name: "Images",
          extensions: [
            "png",
            "jpg",
            "jpeg",
            "webp",
            "bmp",
            "tiff",
            "tif",
            "gif",
            "ico",
            "avif",
          ],
        },
      ],
    });
    if (typeof path !== "string") return;
    await load(path);
    if (active === HOME) openTool(DEFAULT_DROP_TOOL);
  }, [active, load, openTool]);

  const onExport = useCallback(async () => {
    if (!doc || exporting) return;
    const base = doc.name.replace(/\.[^.]+$/, "");
    const path = await save({
      defaultPath: `${base}-edited.${format}`,
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    });
    if (!path) return;
    setExporting(true);
    try {
      await exportImage(
        doc.id,
        buildOps(edit),
        path,
        format,
        quality,
        settings.matte,
      );
    } catch (e) {
      await message(String(e), { title: "Export failed", kind: "error" });
    } finally {
      setExporting(false);
    }
  }, [doc, edit, format, quality, settings.matte, exporting]);

  const selectCategory = (next: CategoryId | "all") => {
    setCategory(next);
    setActive(HOME);
  };

  // Tauri delivers OS file drops through the webview, not HTML drag events.
  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((e) => {
      if (e.payload.type === "over") return setDropping(true);
      if (e.payload.type === "leave") return setDropping(false);
      if (e.payload.type !== "drop") return;

      setDropping(false);
      const path = e.payload.paths[0];
      if (!path) return;
      if (active === HOME) openTool(DEFAULT_DROP_TOOL);
      void load(path);
    });
    return () => void unlisten.then((f) => f());
  }, [active, openTool, load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.defaultPrevented || showSettings) return;
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
      } else if (e.key.toLowerCase() === "s" && doc) {
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
  }, [history, active, closeTab, pickFile, doc, onExport, showSettings]);

  const tabs = useMemo(
    () => [
      { id: HOME, toolId: null, docName: null },
      ...openTools.map((t) => ({
        id: t,
        toolId: t,
        docName: doc?.name ?? null,
      })),
    ],
    [openTools, doc],
  );

  const fileItems: MenuItem[] = [
    {
      label: "Open image…",
      shortcut: "Ctrl O",
      onSelect: () => void pickFile(),
    },
    {
      label: exporting ? "Exporting…" : "Export image…",
      shortcut: "Ctrl S",
      disabled: !doc || exporting,
      onSelect: () => void onExport(),
    },
    { label: "Close image", disabled: !doc || exporting, onSelect: closeDoc },
    {
      label: "Settings…",
      shortcut: "Ctrl ,",
      onSelect: () => setShowSettings(true),
    },
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
      <div className={`app ${dropping ? "is-dropping" : ""}`}>
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
            ) : (
              <Workspace
                tool={active as ToolId}
                doc={doc}
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
          <span>Drop to open</span>
        </div>
      </div>
    </ContextMenu>
  );
}
