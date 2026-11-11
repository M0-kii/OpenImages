import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { usePreview } from "./usePreview";
import { renderPreview } from "../lib/api";
import type { Operation } from "../lib/ops";

vi.mock("../lib/api", () => ({ renderPreview: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

it("keeps the frame during edits but never shows a frame from the previous image", async () => {
  vi.useFakeTimers();
  const create = vi.fn().mockReturnValueOnce("blob:first").mockReturnValueOnce("blob:second");
  const revoke = vi.fn();
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL = create;
    static revokeObjectURL = revoke;
  });
  let finishEdit!: (blob: Blob) => void;
  const pendingEdit = new Promise<Blob>((resolve) => { finishEdit = resolve; });
  vi.mocked(renderPreview)
    .mockResolvedValueOnce(new Blob())
    .mockReturnValueOnce(pendingEdit)
    .mockResolvedValueOnce(new Blob());
  const initialProps: { id: number; ops: Operation[] } = { id: 1, ops: [] };
  const { result, rerender, unmount } = renderHook(
    ({ id, ops }: { id: number; ops: Operation[] }) => usePreview(id, ops, 1),
    { initialProps },
  );

  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(result.current.url).toBe("blob:first");

  rerender({ id: 1, ops: [{ kind: "invert" }] });
  expect(result.current.url).toBe("blob:first");
  await act(() => vi.advanceTimersByTimeAsync(1));

  rerender({ id: 2, ops: [] });
  expect(result.current.url).toBeNull();
  expect(revoke).toHaveBeenCalledWith("blob:first");
  await act(async () => finishEdit(new Blob()));
  expect(create).toHaveBeenCalledTimes(1);

  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(result.current.url).toBe("blob:second");
  unmount();
  expect(revoke).toHaveBeenCalledWith("blob:second");
});
