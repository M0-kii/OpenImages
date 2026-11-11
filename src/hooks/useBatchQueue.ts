import { useCallback, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { batchExport, type BatchResize, type OutputFormat } from "../lib/api";
import type { Operation } from "../lib/ops";
import { useSettings } from "../state/settings";

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "bmp", "tiff", "tif", "gif", "ico", "avif"];
const FORMATS: readonly OutputFormat[] = ["png", "jpeg", "webp", "bmp", "tiff", "ico"];
const PRESETS_KEY = "openimages.batch-presets";
export const MAX_BATCH_EDGE = 32768;

interface BatchOptions {
  format: OutputFormat;
  quality: number;
  suffix: string;
  resizeMode: "keep" | BatchResize["mode"];
  width: number;
  height: number;
}

interface BatchPreset {
  name: string;
  options: BatchOptions;
}

interface BatchEntry {
  path: string;
  status: "queued" | "writing" | "written" | "failed";
  message?: string;
}

function optionsError(options: BatchOptions): string | null {
  if (!FORMATS.includes(options.format)) return "Choose an available output format.";
  if (!Number.isInteger(options.quality) || options.quality < 1 || options.quality > 100) {
    return "JPEG quality must be between 1 and 100.";
  }
  if (typeof options.suffix !== "string" || /[\x00-\x1f\x7f-\x9f<>:"/\\|?*]/.test(options.suffix)) {
    return "The filename suffix contains invalid characters.";
  }
  if (!["keep", "fit", "exact"].includes(options.resizeMode)) return "Choose a resize mode.";
  if (options.resizeMode !== "keep") {
    if ([options.width, options.height].some((v) => !Number.isInteger(v) || v < 1 || v > MAX_BATCH_EDGE)) {
      return "Width and height must be between 1 and 32,768 pixels.";
    }
    if (options.resizeMode === "exact" && options.width * options.height > 100_000_000) {
      return "Batch resize is limited to 100 megapixels.";
    }
  }
  return null;
}

function loadPresets(): BatchPreset[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(PRESETS_KEY) ?? "[]");
    return Array.isArray(saved)
      ? saved.filter(
          (item): item is BatchPreset =>
            typeof item?.name === "string" && item.name.trim().length > 0 &&
            item.options && Number.isFinite(item.options.width) &&
            Number.isFinite(item.options.height) && optionsError(item.options) === null,
        )
      : [];
  } catch {
    return [];
  }
}

export function useBatchQueue() {
  const { settings } = useSettings();
  const [entries, setEntries] = useState<BatchEntry[]>([]);
  const [options, setOptions] = useState<BatchOptions>(() => ({
    format: settings.defaultFormat,
    quality: settings.defaultQuality,
    suffix: "-edited",
    resizeMode: "keep",
    width: 1600,
    height: 1600,
  }));
  const [presets, setPresets] = useState(loadPresets);
  const [editsDocId, setEditsDocId] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const picking = useRef(false);
  const stopRequested = useRef(false);

  const addFiles = useCallback((paths: readonly string[]) => {
    if (busy.current || paths.length === 0) return;
    setError(null);
    setEntries((current) => {
      const known = new Set(current.map(({ path }) => path));
      const added: BatchEntry[] = [];
      for (const path of paths) {
        if (!path || known.has(path)) continue;
        known.add(path);
        added.push({ path, status: "queued" });
      }
      return added.length ? [...current, ...added] : current;
    });
  }, []);

  const pickFiles = useCallback(async () => {
    if (busy.current || picking.current) return;
    picking.current = true;
    try {
      const paths = await open({
        multiple: true,
        filters: [{ name: "Images", extensions: IMAGE_EXTENSIONS }],
      });
      if (paths) addFiles(Array.isArray(paths) ? paths : [paths]);
    } catch (reason) {
      setError("Could not open the file picker: " + String(reason));
    } finally {
      picking.current = false;
    }
  }, [addFiles]);

  function removeFile(path: string) {
    if (!busy.current) setEntries((current) => current.filter((entry) => entry.path !== path));
  }

  function clear() {
    if (!busy.current) {
      setEntries([]);
      setError(null);
    }
  }

  function storePresets(next: BatchPreset[]) {
    try {
      localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
      setPresets(next);
      setError(null);
      return true;
    } catch {
      setError("Could not save presets on this device.");
      return false;
    }
  }

  const validationError = optionsError(options);

  function savePreset(value: string) {
    const name = value.trim();
    if (busy.current || validationError || !name) return false;
    if (presets.some((preset) => preset.name.toLowerCase() === name.toLowerCase())) {
      setError("A preset with that name already exists.");
      return false;
    }
    return storePresets([...presets, { name, options }]);
  }

  function applyPreset(name: string) {
    const preset = presets.find((item) => item.name === name);
    if (preset && !busy.current) {
      setOptions(preset.options);
      setError(null);
    }
  }

  function deletePreset(name: string) {
    if (!busy.current) storePresets(presets.filter((preset) => preset.name !== name));
  }

  async function run(ops: Operation[]) {
    if (busy.current || picking.current || !entries.length || validationError) return;
    busy.current = true;
    stopRequested.current = false;
    setRunning(true);
    setError(null);
    try {
      const dir = await open({ directory: true, title: "Choose an output folder" });
      if (typeof dir !== "string") return;
      const { format, quality, suffix, resizeMode, width, height } = options;
      const resize = resizeMode === "keep" ? null : { mode: resizeMode, width, height };
      setEntries((current) => current.map(({ path }) => ({ path, status: "queued" })));
      for (const { path } of entries) {
        if (stopRequested.current) break;
        const update = (status: BatchEntry["status"], message?: string) =>
          setEntries((current) => current.map((entry) =>
            entry.path === path ? { path, status, message } : entry,
          ));
        update("writing");
        try {
          const [result] = await batchExport(ops, [path], dir, format, quality, settings.matte, suffix, resize);
          if (!result) throw new Error("No export result was returned");
          update(result.ok ? "written" : "failed", result.message);
        } catch (reason) {
          update("failed", String(reason));
        }
      }
    } catch (reason) {
      setError("Could not choose an output folder: " + String(reason));
    } finally {
      busy.current = false;
      setRunning(false);
      setStopping(false);
    }
  }

  function stop() {
    if (busy.current) {
      stopRequested.current = true;
      setStopping(true);
    }
  }

  return {
    entries, addFiles, pickFiles, removeFile, clear, options, setOptions,
    editsDocId, setEditsDocId, presets, savePreset, applyPreset, deletePreset,
    validationError, error, running, stopping, run, stop,
  };
}
