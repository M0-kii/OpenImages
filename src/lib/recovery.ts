import type { DocMeta, OutputFormat } from "./api";
import { INITIAL_EDIT, rgb, type EditState } from "./ops";

const KEY = "openimages.recovery";

export interface RecoveryDraft {
  version: 1;
  path: string;
  image: Pick<DocMeta, "name" | "width" | "height">;
  edit: EditState;
  format: OutputFormat;
  quality: number;
}

const EDIT_SHAPE = {
  ...INITIAL_EDIT,
  crop: { x: 0, y: 0, width: 1, height: 1 },
  resize: { width: 1, height: 1, filter: "lanczos3" },
  pad: { width: 1, height: 1, color: rgb(0, 0, 0), anchor: "center" },
  threshold: 0,
  colorKey: { color: rgb(0, 0, 0), tolerance: 0 },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function matchesShape(value: unknown, shape: unknown): boolean {
  if (typeof shape === "number") return typeof value === "number" && Number.isFinite(value);
  if (isRecord(shape)) {
    return isRecord(value) && Object.entries(shape).every(([key, child]) => matchesShape(value[key], child));
  }
  return typeof value === typeof shape;
}

function isEditState(value: unknown): value is EditState {
  if (!isRecord(value)) return false;
  return Object.entries(EDIT_SHAPE).every(([key, shape]) => {
    const child = value[key];
    return child === null
      ? INITIAL_EDIT[key as keyof EditState] === null
      : matchesShape(child, shape);
  });
}

export function readRecovery(): RecoveryDraft | null {
  try {
    const draft: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (
      !isRecord(draft) || draft.version !== 1 ||
      typeof draft.path !== "string" || !draft.path ||
      !isRecord(draft.image) || typeof draft.image.name !== "string" ||
      !matchesShape(draft.image, { width: 1, height: 1 }) ||
      !isEditState(draft.edit) ||
      !["png", "jpeg", "webp", "bmp", "tiff", "ico"].some((format) => format === draft.format) ||
      typeof draft.quality !== "number" || !Number.isInteger(draft.quality) ||
      draft.quality < 1 || draft.quality > 100
    ) return null;
    return draft as unknown as RecoveryDraft;
  } catch {
    return null;
  }
}

export function writeRecovery(draft: RecoveryDraft | null) {
  try {
    if (draft) localStorage.setItem(KEY, JSON.stringify(draft));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage may be unavailable; keep the current edit in memory.
  }
}
