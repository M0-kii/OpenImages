import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ContextMenu, DropdownMenu, type MenuItem } from "./Menu";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function options(): MenuItem[] {
  return [
    { label: "Open image", onSelect: vi.fn(), shortcut: "Ctrl O" },
    { label: "Unavailable", onSelect: vi.fn(), disabled: true },
    { label: "Dark theme", onSelect: vi.fn(), checked: true, separator: true },
  ];
}

it("opens by keyboard, skips disabled items, and restores focus on Escape", () => {
  render(<DropdownMenu label="File" items={options()} />);
  const trigger = screen.getByRole("button", { name: "File" });
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  expect(document.activeElement).toBe(
    screen.getByRole("menuitem", { name: /Open image/ }),
  );
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
  expect(document.activeElement).toBe(
    screen.getByRole("menuitemcheckbox", { name: "Dark theme" }),
  );
  fireEvent.keyDown(document.activeElement!, { key: "Home" });
  expect(document.activeElement).toBe(
    screen.getByRole("menuitem", { name: /Open image/ }),
  );
  fireEvent.keyDown(document.activeElement!, { key: "End" });
  expect(document.activeElement).toBe(
    screen.getByRole("menuitemcheckbox", { name: "Dark theme" }),
  );
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it("runs enabled actions and dismisses outside without running disabled actions", () => {
  const items = options();
  render(<DropdownMenu label="File" items={items} />);
  const trigger = screen.getByRole("button", { name: "File" });
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole("menuitem", { name: "Unavailable" }));
  expect(items[1].onSelect).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("menuitem", { name: /Open image/ }));
  expect(items[0].onSelect).toHaveBeenCalledOnce();
  expect(screen.queryByRole("menu")).toBeNull();
  fireEvent.click(trigger);
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("menu")).toBeNull();
});

it("keeps an all-disabled menu dismissible from the keyboard", () => {
  render(
    <DropdownMenu
      label="Edit"
      items={[{ label: "Undo", disabled: true, onSelect: vi.fn() }]}
    />,
  );
  const trigger = screen.getByRole("button", { name: "Edit" });
  fireEvent.keyDown(trigger, { key: "ArrowUp" });
  expect(document.activeElement).toBe(screen.getByRole("menu"));
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it("dismisses when keyboard focus moves outside the menu and its trigger", () => {
  render(
    <>
      <DropdownMenu label="File" items={options()} />
      <button>Outside</button>
    </>,
  );
  const trigger = screen.getByRole("button", { name: "File" });
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  act(() => trigger.focus());
  expect(screen.getByRole("menu")).toBeTruthy();
  const outside = screen.getByRole("button", { name: "Outside" });
  act(() => outside.focus());
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(outside);
});

it("moves between menubar triggers and opens the adjacent menu", () => {
  render(
    <nav role="menubar">
      <DropdownMenu label="File" items={options()} />
      <DropdownMenu
        label="View"
        items={[{ label: "Fit image", onSelect: vi.fn() }]}
      />
    </nav>,
  );
  const file = screen.getByRole("menuitem", { name: "File" });
  fireEvent.keyDown(file, { key: "ArrowRight" });
  expect(document.activeElement).toBe(
    screen.getByRole("menuitem", { name: "View" }),
  );
  fireEvent.keyDown(file, { key: "ArrowUp" });
  expect(document.activeElement).toBe(
    screen.getByRole("menuitemcheckbox", { name: "Dark theme" }),
  );
  fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
  expect(screen.getByRole("menu", { name: "View" })).toBeTruthy();
  expect(document.activeElement).toBe(
    screen.getByRole("menuitem", { name: "Fit image" }),
  );
  expect(screen.queryByRole("menu", { name: "File" })).toBeNull();
});

it("clamps a context menu inside the viewport and leaves editable context menus alone", () => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 210,
    bottom: 150,
    width: 210,
    height: 150,
    toJSON: () => ({}),
  });
  render(
    <ContextMenu items={options()}>
      <button>Canvas</button>
      <input aria-label="Name" />
    </ContextMenu>,
  );
  const input = screen.getByRole("textbox");
  expect(fireEvent.contextMenu(input, { clientX: 20, clientY: 20 })).toBe(true);
  expect(screen.queryByRole("menu")).toBeNull();
  const canvas = screen.getByRole("button", { name: "Canvas" });
  expect(
    fireEvent.contextMenu(canvas, {
      clientX: window.innerWidth - 1,
      clientY: window.innerHeight - 1,
    }),
  ).toBe(false);
  const menu = screen.getByRole("menu");
  expect(menu.style.left).toBe(`${window.innerWidth - 218}px`);
  expect(menu.style.top).toBe(`${window.innerHeight - 158}px`);
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(document.activeElement).toBe(canvas);
  fireEvent.keyDown(canvas, { key: "F10", shiftKey: true });
  expect(screen.getByRole("menu")).toBeTruthy();
});

it("honors a nested context menu without opening its parent", () => {
  render(
    <ContextMenu items={[{ label: "Outer action", onSelect: vi.fn() }]}>
      <ContextMenu items={[{ label: "Inner action", onSelect: vi.fn() }]}>
        <button>Canvas</button>
      </ContextMenu>
    </ContextMenu>,
  );
  fireEvent.contextMenu(screen.getByRole("button", { name: "Canvas" }));
  expect(screen.getAllByRole("menu")).toHaveLength(1);
  expect(screen.getByRole("menuitem", { name: "Inner action" })).toBeTruthy();
  expect(screen.queryByRole("menuitem", { name: "Outer action" })).toBeNull();
});

it("leaves native dialog context menus available", () => {
  render(
    <ContextMenu items={options()}>
      <dialog open>
        <button>Settings control</button>
      </dialog>
    </ContextMenu>,
  );
  const control = screen.getByRole("button", { name: "Settings control" });
  expect(fireEvent.contextMenu(control)).toBe(true);
  fireEvent.keyDown(control, { key: "F10", shiftKey: true });
  expect(screen.queryByRole("menu")).toBeNull();
});
