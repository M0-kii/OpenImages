import { useCallback, useRef, useState } from "react";

/** Past states are cheap (plain JSON), but not free. Cap the tape. */
const MAX_ENTRIES = 120;

/** Consecutive edits to the same control within this window collapse into one. */
const COALESCE_MS = 500;

interface Tape<T> {
  stack: T[];
  index: number;
}

export interface History<T> {
  present: T;
  /**
   * `coalesceKey` groups rapid edits: dragging the brightness slider produces
   * one undo entry, not sixty. Moving to a different control starts a new one.
   * Pass undefined to always push a discrete entry.
   */
  set: (next: T | ((prev: T) => T), coalesceKey?: string) => void;
  /** Drop the whole tape and start over — for loading a new image. */
  reset: (value: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useHistory<T>(initial: T): History<T> {
  // Stack and index live in one state object: they must move together, and two
  // separate setStates can interleave badly when several edits land in a batch.
  const [tape, setTape] = useState<Tape<T>>({ stack: [initial], index: 0 });

  // Refs, not state — coalescing must read the newest commit even mid-batch.
  const lastKey = useRef<string | undefined>(undefined);
  const lastAt = useRef(0);

  const set = useCallback((next: T | ((prev: T) => T), coalesceKey?: string) => {
    const now = Date.now();
    const merge =
      coalesceKey !== undefined &&
      coalesceKey === lastKey.current &&
      now - lastAt.current < COALESCE_MS;

    lastKey.current = coalesceKey;
    lastAt.current = now;

    setTape(({ stack, index }) => {
      const present = stack[index];
      const value = typeof next === "function" ? (next as (p: T) => T)(present) : next;

      // A control that lands back on its current value shouldn't burn an entry.
      if (JSON.stringify(value) === JSON.stringify(present)) return { stack, index };

      // Any new edit truncates the redo branch.
      const head = stack.slice(0, index + 1);
      if (merge && head.length > 1) head[head.length - 1] = value;
      else head.push(value);

      const trimmed = head.slice(Math.max(0, head.length - MAX_ENTRIES));
      return { stack: trimmed, index: trimmed.length - 1 };
    });
  }, []);

  const reset = useCallback((value: T) => {
    lastKey.current = undefined;
    setTape({ stack: [value], index: 0 });
  }, []);

  // Stepping must also clear the coalesce key, or the next edit would merge into
  // the entry we just stepped onto and quietly rewrite history.
  const undo = useCallback(() => {
    lastKey.current = undefined;
    setTape((t) => ({ ...t, index: Math.max(0, t.index - 1) }));
  }, []);

  const redo = useCallback(() => {
    lastKey.current = undefined;
    setTape((t) => ({ ...t, index: Math.min(t.stack.length - 1, t.index + 1) }));
  }, []);

  return {
    present: tape.stack[tape.index],
    set,
    reset,
    undo,
    redo,
    canUndo: tape.index > 0,
    canRedo: tape.index < tape.stack.length - 1,
  };
}
