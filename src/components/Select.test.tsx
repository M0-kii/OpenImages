import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { Select } from "./Select";

const options = [
  ["PNG", "png"],
  ["JPEG", "jpeg"],
  ["WebP", "webp"],
] as const;
const showPopover = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "showPopover",
);
const hidePopover = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "hidePopover",
);

beforeAll(() => {
  Object.defineProperties(HTMLElement.prototype, {
    showPopover: {
      configurable: true,
      value(this: HTMLElement) {
        this.style.display = "block";
      },
    },
    hidePopover: {
      configurable: true,
      value(this: HTMLElement) {
        this.style.display = "none";
      },
    },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
afterAll(() => {
  if (showPopover)
    Object.defineProperty(HTMLElement.prototype, "showPopover", showPopover);
  else delete (HTMLElement.prototype as Partial<HTMLElement>).showPopover;
  if (hidePopover)
    Object.defineProperty(HTMLElement.prototype, "hidePopover", hidePopover);
  else delete (HTMLElement.prototype as Partial<HTMLElement>).hidePopover;
});

function setup() {
  const onChange = vi.fn();
  function Harness() {
    const [value, setValue] = useState("png");
    return (
      <Select
        aria-label="Format"
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
        options={options}
      />
    );
  }
  render(<Harness />);
  return {
    trigger: screen.getByRole("combobox", { name: "Format" }),
    onChange,
  };
}

it("opens a listbox and commits keyboard selection with focus returned to its trigger", () => {
  const { trigger, onChange } = setup();
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  const list = screen.getByRole("listbox", { name: "Format" });
  expect(document.activeElement).toBe(list);
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.keyDown(list, { key: "End" });
  fireEvent.keyDown(list, { key: "Enter" });
  expect(onChange).toHaveBeenCalledWith("webp");
  expect(trigger.textContent).toBe("WebP");
  expect(document.activeElement).toBe(trigger);
  expect(screen.queryByRole("listbox")).toBeNull();
  fireEvent.click(trigger);
  expect(
    screen.getByRole("option", { name: "WebP" }).getAttribute("aria-selected"),
  ).toBe("true");
});

it("supports Home, arrow keys, typeahead, and pointer selection", () => {
  const { trigger, onChange } = setup();
  fireEvent.click(trigger);
  const list = screen.getByRole("listbox");
  fireEvent.keyDown(list, { key: "ArrowUp" });
  expect(list.getAttribute("aria-activedescendant")).toBe(
    screen.getByRole("option", { name: "WebP" }).id,
  );
  fireEvent.keyDown(list, { key: "Home" });
  expect(list.getAttribute("aria-activedescendant")).toBe(
    screen.getByRole("option", { name: "PNG" }).id,
  );
  fireEvent.keyDown(list, { key: "j" });
  expect(list.getAttribute("aria-activedescendant")).toBe(
    screen.getByRole("option", { name: "JPEG" }).id,
  );
  fireEvent.click(screen.getByRole("option", { name: "JPEG" }));
  expect(onChange).toHaveBeenCalledWith("jpeg");
  expect(trigger.textContent).toBe("JPEG");
});

it("cancels on Escape and dismisses on outside interaction without committing", () => {
  const { trigger, onChange } = setup();
  fireEvent.click(trigger);
  fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" });
  fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(document.activeElement).toBe(trigger);
  fireEvent.click(trigger);
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
});

it("tracks native popover dismissal", () => {
  const { trigger } = setup();
  fireEvent.click(trigger);
  fireEvent(
    screen.getByRole("listbox"),
    Object.assign(new Event("toggle"), { newState: "closed" }),
  );
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
});

it("commits the highlighted option before tabbing away", () => {
  const { trigger, onChange } = setup();
  fireEvent.click(trigger);
  fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" });
  fireEvent.keyDown(screen.getByRole("listbox"), { key: "Tab" });
  expect(onChange).toHaveBeenCalledWith("jpeg");
  expect(screen.queryByRole("listbox")).toBeNull();
});

it("does not open a disabled control", () => {
  const onChange = vi.fn();
  render(
    <Select
      aria-label="Format"
      value="png"
      onChange={onChange}
      options={options}
      disabled
    />,
  );
  const trigger = screen.getByRole("combobox");
  expect((trigger as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(trigger);
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
});

it("keeps the popup in the viewport and opens upward when needed", () => {
  const { trigger } = setup();
  vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
    left: 940,
    right: 1030,
    top: 724,
    bottom: 760,
    width: 90,
    height: 36,
    x: 940,
    y: 724,
    toJSON() {},
  });
  vi.spyOn(Element.prototype, "scrollHeight", "get").mockReturnValue(240);
  fireEvent.click(trigger);
  const list = screen.getByRole("listbox");
  expect(list.style.left).toBe("856px");
  expect(list.style.top).toBe("479px");
});
