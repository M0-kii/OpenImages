import { invoke } from "@tauri-apps/api/core";
import type { Color, Operation } from "./ops";

export interface DocMeta {
  id: number;
  name: string;
  width: number;
  height: number;
  hasAlpha: boolean;
}

export type OutputFormat = "png" | "jpeg" | "webp" | "bmp" | "tiff" | "ico";

/** Formats with no alpha channel: transparency must be composited before encoding. */
export const OPAQUE_FORMATS: OutputFormat[] = ["jpeg"];

export const openImage = (path: string) => invoke<DocMeta>("open_image", { path });

export const closeImage = (id: number) => invoke<void>("close_image", { id });

export const supportedFormats = () => invoke<OutputFormat[]>("supported_formats");

export const outputSize = (id: number, ops: Operation[]) =>
  invoke<[number, number]>("output_size", { id, ops });

export const exportImage = (
  id: number,
  ops: Operation[],
  path: string,
  format: OutputFormat,
  quality: number,
  matte: Color,
) => invoke<void>("export_image", { id, ops, path, format, quality, matte });

export const exportFavicon = (id: number, ops: Operation[], dir: string) =>
  invoke<string[]>("export_favicon", { id, ops, dir });

export interface Swatch {
  hex: string;
  weight: number;
}

export const extractPalette = (id: number, ops: Operation[], count: number) =>
  invoke<Swatch[]>("extract_palette", { id, ops, count });

export interface DataUriResult {
  uri: string;
  bytes: number;
}

export const dataUri = (
  id: number,
  ops: Operation[],
  format: OutputFormat,
  quality: number,
  maxEdge: number,
  matte: Color,
) => invoke<DataUriResult>("data_uri", { id, ops, format, quality, maxEdge, matte });

export interface BatchResult {
  name: string;
  ok: boolean;
  message: string;
}

export interface BatchResize {
  width: number;
  height: number;
  mode: "fit" | "exact";
}

export const batchExport = (
  ops: Operation[],
  paths: string[],
  outDir: string,
  format: OutputFormat,
  quality: number,
  matte: Color,
  suffix: string,
  resize: BatchResize | null,
) => invoke<BatchResult[]>("batch_export", { ops, paths, outDir, format, quality, matte, suffix, resize });

/** Raw PNG bytes, handed straight to a Blob — no base64 round-trip. */
export async function renderPreview(id: number, ops: Operation[]): Promise<Blob> {
  const bytes = await invoke<ArrayBuffer>("render_preview", { id, ops });
  return new Blob([bytes], { type: "image/png" });
}
