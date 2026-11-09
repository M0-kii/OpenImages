import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { ContextMenu } from "../components/Menu";
import { useShellGuards } from "./useShellGuards";

afterEach(cleanup);

function Guarded({ children }: { children: ReactNode }) {
  useShellGuards();
  return children;
}

it("suppresses default menus on ordinary, editable, dialog and popover content", () => {
  render(
    <Guarded>
      <button>Canvas</button>
      <input aria-label="Hex" />
      <textarea aria-label="Notes" />
      <dialog open>
        <button>Settings control</button>
        <div popover="manual" data-testid="popup">
          Popup
        </div>
      </dialog>
    </Guarded>,
  );
  for (const target of [
    screen.getByRole("button", { name: "Canvas" }),
    screen.getByRole("textbox", { name: "Hex" }),
    screen.getByRole("textbox", { name: "Notes" }),
    screen.getByRole("button", { name: "Settings control" }),
    screen.getByTestId("popup"),
  ]) {
    expect(fireEvent.contextMenu(target)).toBe(false);
    expect(fireEvent.keyDown(target, { key: "ContextMenu" })).toBe(false);
    expect(fireEvent.keyDown(target, { key: "F10", shiftKey: true })).toBe(
      false,
    );
  }
});

it("preserves custom context menus while preventing editable native menus", () => {
  render(
    <Guarded>
      <ContextMenu items={[{ label: "Open image", onSelect: vi.fn() }]}>
        <button>Canvas</button>
        <input aria-label="Hex" />
      </ContextMenu>
    </Guarded>,
  );
  const field = screen.getByRole("textbox");
  expect(fireEvent.contextMenu(field)).toBe(false);
  expect(screen.queryByRole("menu")).toBeNull();
  expect(
    fireEvent.contextMenu(screen.getByRole("button", { name: "Canvas" })),
  ).toBe(false);
  expect(screen.getByRole("menu", { name: "Context actions" })).toBeTruthy();
  fireEvent.keyDown(screen.getByRole("menuitem", { name: "Open image" }), {
    key: "Escape",
  });
  expect(
    fireEvent.keyDown(screen.getByRole("button", { name: "Canvas" }), {
      key: "F10",
      shiftKey: true,
    }),
  ).toBe(false);
  expect(screen.getByRole("menu")).toBeTruthy();
});

it("blocks inspector shortcuts without blocking editing and app shortcuts", () => {
  render(
    <Guarded>
      <input aria-label="Hex" />
    </Guarded>,
  );
  const field = screen.getByRole("textbox");
  for (const shortcut of [
    { key: "F12" },
    { key: "I", ctrlKey: true, shiftKey: true },
    { key: "j", ctrlKey: true, shiftKey: true },
    { key: "c", ctrlKey: true, shiftKey: true },
    { key: "i", metaKey: true, altKey: true },
  ]) {
    expect(fireEvent.keyDown(field, shortcut)).toBe(false);
  }
  for (const key of ["c", "v", "x", "a", "z", "o", "s"])
    expect(fireEvent.keyDown(field, { key, ctrlKey: true })).toBe(true);
  expect(fireEvent.keyDown(field, { key: "F10" })).toBe(true);
});

it("removes its listeners on unmount", () => {
  const { unmount } = render(
    <Guarded>
      <button>Canvas</button>
    </Guarded>,
  );
  unmount();
  expect(fireEvent.contextMenu(document.body)).toBe(true);
  expect(fireEvent.keyDown(window, { key: "F12" })).toBe(true);
});
