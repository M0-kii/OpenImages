import { useCallback, useRef, useState } from "react";

/** Past states are cheap (plain JSON), but not free. Cap the tape. */
const MAX_ENTRIES = 120;

/** Consecutive edits to the same control within this window collapse into one. */
const COALESCE_MS = 500;

interface Tape<T> {
  stack: T[];
  index: number;
  lastEdit?: { key: string; group: number; at: number };
}

export interface History<T> {
  present: T;
  /**
   * `coalesceKey` groups rapid edits: dragging the brightness slider produces
   * one undo entry, not sixty. Moving to a different control starts a new one.
   * Pass undefined to always push a discrete entry.
   */
  set: (next: T | ((prev: T) => T), coalesceKey?: string) => void;
  endGroup: () => void;
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

  const group = useRef(0);
  const endGroup = useCallback(() => {
    group.current += 1;
  }, []);

  const set = useCallback(
    (next: T | ((prev: T) => T), coalesceKey?: string) => {
      const change =
        coalesceKey === undefined
          ? undefined
          : { key: coalesceKey, group: group.current, at: Date.now() };
      setTape((tape) => {
        const { stack, index, lastEdit } = tape;
        const present = stack[index];
        const value =
          typeof next === "function" ? (next as (p: T) => T)(present) : next;

        // A control that lands back on its current value shouldn't burn an entry.
        if (JSON.stringify(value) === JSON.stringify(present)) return tape;

        const merge =
          change &&
          lastEdit &&
          change.key === lastEdit.key &&
          change.group === lastEdit.group &&
          change.at - lastEdit.at < COALESCE_MS;

        // Any new edit truncates the redo branch.
        const head = stack.slice(0, index + 1);
        if (merge && head.length > 1) head[head.length - 1] = value;
        else head.push(value);

        const trimmed = head.slice(Math.max(0, head.length - MAX_ENTRIES));
        return { stack: trimmed, index: trimmed.length - 1, lastEdit: change };
      });
    },
    [],
  );

  const reset = useCallback((value: T) => {
    setTape({ stack: [value], index: 0 });
  }, []);

  // Stepping must also clear the coalesce key, or the next edit would merge into
  // the entry we just stepped onto and quietly rewrite history.
  const undo = useCallback(() => {
    setTape((t) => ({
      ...t,
      index: Math.max(0, t.index - 1),
      lastEdit: undefined,
    }));
  }, []);

  const redo = useCallback(() => {
    setTape((t) => ({
      ...t,
      index: Math.min(t.stack.length - 1, t.index + 1),
      lastEdit: undefined,
    }));
  }, []);

  return {
    present: tape.stack[tape.index],
    set,
    endGroup,
    reset,
    undo,
    redo,
    canUndo: tape.index > 0,
    canRedo: tape.index < tape.stack.length - 1,
  };
}
