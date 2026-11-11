import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { BatchResult } from "../lib/api";
import { SettingsProvider } from "../state/settings";
import { useBatchQueue } from "./useBatchQueue";

const mocks = vi.hoisted(() => ({ open: vi.fn(), batchExport: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mocks.open }));
vi.mock("../lib/api", () => ({ batchExport: mocks.batchExport }));

beforeEach(() => {
  localStorage.clear();
  mocks.open.mockReset();
  mocks.batchExport.mockReset();
});
afterEach(cleanup);

const mountQueue = () => renderHook(() => useBatchQueue(), { wrapper: SettingsProvider });

it("adds picked and dropped paths once and reports a result before the rest finish", async () => {
  const { result } = mountQueue();
  mocks.open.mockResolvedValueOnce(["C:\\input\\a.png", "C:\\input\\a.png"]);
  await act(() => result.current.pickFiles());
  act(() => result.current.addFiles(["C:\\input\\a.png", "C:\\input\\b.png"]));
  expect(result.current.entries.map((item) => item.path)).toEqual(["C:\\input\\a.png", "C:\\input\\b.png"]);

  mocks.open.mockResolvedValueOnce("C:\\output");
  let finishLast!: (results: BatchResult[]) => void;
  mocks.batchExport
    .mockResolvedValueOnce([{ name: "a.png", ok: true, message: "a-edited.png" }])
    .mockImplementationOnce(() => new Promise<BatchResult[]>((resolve) => { finishLast = resolve; }));
  let run!: Promise<void>;
  act(() => { run = result.current.run([]); });

  await waitFor(() => expect(result.current.entries.map((item) => item.status)).toEqual(["written", "writing"]));
  expect(mocks.batchExport.mock.calls.map((args) => args[1])).toEqual([
    ["C:\\input\\a.png"],
    ["C:\\input\\b.png"],
  ]);
  await act(async () => {
    finishLast([{ name: "b.png", ok: false, message: "Destination already exists" }]);
    await run;
  });
  expect(result.current.running).toBe(false);
  expect(result.current.entries[1]).toMatchObject({ status: "failed", message: "Destination already exists" });
});

it("stops after the active file and keeps the other files queued", async () => {
  const { result } = mountQueue();
  act(() => result.current.addFiles(["a.png", "b.png"]));
  mocks.open.mockResolvedValueOnce("output");
  let finish!: (results: BatchResult[]) => void;
  mocks.batchExport.mockImplementationOnce(() => new Promise<BatchResult[]>((resolve) => { finish = resolve; }));
  let run!: Promise<void>;
  act(() => { run = result.current.run([]); });
  await waitFor(() => expect(result.current.entries[0].status).toBe("writing"));
  act(() => result.current.stop());
  await act(async () => {
    finish([{ name: "a.png", ok: true, message: "a-edited.png" }]);
    await run;
  });
  expect(mocks.batchExport).toHaveBeenCalledTimes(1);
  expect(result.current.entries.map((item) => item.status)).toEqual(["written", "queued"]);
  expect(result.current.running).toBe(false);
});

it("reloads a named resize and export preset without persisting the source edit selection", async () => {
  const first = mountQueue();
  const saved = {
    format: "jpeg",
    quality: 82,
    suffix: "-web",
    resizeMode: "fit",
    width: 1200,
    height: 800,
  } as const;
  act(() => first.result.current.setOptions(saved));
  act(() => first.result.current.setEditsDocId(3));
  act(() => { expect(first.result.current.savePreset("Web photos")).toBe(true); });
  first.unmount();

  const { result } = mountQueue();
  act(() => result.current.applyPreset("Web photos"));
  expect(result.current.options).toEqual(saved);
  expect(result.current.editsDocId).toBeNull();
  act(() => result.current.addFiles(["image.png"]));
  mocks.open.mockResolvedValueOnce("output");
  mocks.batchExport.mockResolvedValueOnce([{ name: "image.png", ok: true, message: "image-web.jpeg" }]);
  await act(() => result.current.run([]));
  expect(mocks.batchExport).toHaveBeenCalledWith(
    [], ["image.png"], "output", "jpeg", 82, expect.any(Object), "-web",
    { mode: "fit", width: 1200, height: 800 },
  );
});
