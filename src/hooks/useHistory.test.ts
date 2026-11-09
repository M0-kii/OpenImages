import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useHistory } from "./useHistory";

describe("useHistory", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts with no undo and no redo", () => {
    const { result } = renderHook(() => useHistory({ n: 0 }));
    expect(result.current.present).toEqual({ n: 0 });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("steps back and forward through discrete edits", () => {
    const { result } = renderHook(() => useHistory({ n: 0 }));

    act(() => result.current.set({ n: 1 }));
    act(() => result.current.set({ n: 2 }));
    expect(result.current.present).toEqual({ n: 2 });

    act(() => result.current.undo());
    expect(result.current.present).toEqual({ n: 1 });
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.undo());
    expect(result.current.present).toEqual({ n: 0 });
    expect(result.current.canUndo).toBe(false);

    act(() => result.current.redo());
    expect(result.current.present).toEqual({ n: 1 });
  });

  it("accepts an updater function", () => {
    const { result } = renderHook(() => useHistory({ n: 5 }));
    act(() => result.current.set((p) => ({ n: p.n + 1 })));
    expect(result.current.present).toEqual({ n: 6 });
  });

  it("ignores a set that does not change the value", () => {
    const { result } = renderHook(() => useHistory({ n: 1 }));
    act(() => result.current.set({ n: 1 }));
    expect(result.current.canUndo).toBe(false);
  });

  it("collapses rapid edits to the same control into one undo step", () => {
    // Dragging a slider must cost one undo, not sixty.
    const { result } = renderHook(() => useHistory({ n: 0 }));

    act(() => result.current.set({ n: 1 }, "brightness"));
    act(() => result.current.set({ n: 2 }, "brightness"));
    act(() => result.current.set({ n: 3 }, "brightness"));
    expect(result.current.present).toEqual({ n: 3 });

    act(() => result.current.undo());
    expect(result.current.present).toEqual({ n: 0 });
  });

  it("starts a new entry when the control changes", () => {
    const { result } = renderHook(() => useHistory({ n: 0 }));
    act(() => result.current.set({ n: 1 }, "brightness"));
    act(() => result.current.set({ n: 2 }, "contrast"));

    act(() => result.current.undo());
    expect(result.current.present).toEqual({ n: 1 });
  });

  it("does not merge a new gesture after an unchanged value", () => {
    const { result } = renderHook(() => useHistory({ n: 0 }));
    act(() => {
      result.current.set({ n: 1 }, "brightness");
      result.current.endGroup();
      result.current.set({ n: 1 }, "brightness");
      result.current.set({ n: 2 }, "brightness");
      result.current.undo();
    });
    expect(result.current.present).toEqual({ n: 1 });
  });

  it("starts a new entry after the coalesce window lapses", () => {
    const { result } = renderHook(() => useHistory({ n: 0 }));
    act(() => result.current.set({ n: 1 }, "brightness"));
    act(() => vi.advanceTimersByTime(600));
    act(() => result.current.set({ n: 2 }, "brightness"));

    act(() => result.current.undo());
    expect(result.current.present).toEqual({ n: 1 });
  });

  it("never coalesces when no key is given", () => {
    const { result } = renderHook(() => useHistory({ n: 0 }));
    act(() => result.current.set({ n: 1 }));
    act(() => result.current.set({ n: 2 }));
    act(() => result.current.undo());
    expect(result.current.present).toEqual({ n: 1 });
  });

  it("does not merge an edit into the entry it just undid onto", () => {
    // Regression: after stepping back, the stale coalesce key would let the next
    // edit overwrite the restored entry instead of branching from it.
    const { result } = renderHook(() => useHistory({ n: 0 }));

    act(() => result.current.set({ n: 1 }, "brightness"));
    act(() => result.current.set({ n: 2 }, "brightness"));
    act(() => result.current.undo()); // back to { n: 0 }
    act(() => result.current.set({ n: 9 }, "brightness"));

    expect(result.current.present).toEqual({ n: 9 });
    act(() => result.current.undo());
    expect(result.current.present).toEqual({ n: 0 });
  });

  it("truncates the redo branch on a new edit", () => {
    const { result } = renderHook(() => useHistory({ n: 0 }));
    act(() => result.current.set({ n: 1 }));
    act(() => result.current.set({ n: 2 }));
    act(() => result.current.undo());
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.set({ n: 7 }));
    expect(result.current.canRedo).toBe(false);
    expect(result.current.present).toEqual({ n: 7 });
  });

  it("reset drops the whole tape", () => {
    const { result } = renderHook(() => useHistory({ n: 0 }));
    act(() => result.current.set({ n: 1 }));
    act(() => result.current.reset({ n: 42 }));

    expect(result.current.present).toEqual({ n: 42 });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("caps the tape and keeps the newest entries", () => {
    const { result } = renderHook(() => useHistory({ n: 0 }));
    for (let i = 1; i <= 200; i++) act(() => result.current.set({ n: i }));

    expect(result.current.present).toEqual({ n: 200 });
    // Walk all the way back; the oldest states were dropped, so we can't reach 0.
    for (let i = 0; i < 300; i++) act(() => result.current.undo());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.present.n).toBeGreaterThan(0);
  });

  it("clamps redo at the head", () => {
    const { result } = renderHook(() => useHistory({ n: 0 }));
    act(() => result.current.set({ n: 1 }));
    act(() => result.current.redo());
    act(() => result.current.redo());
    expect(result.current.present).toEqual({ n: 1 });
  });
});
