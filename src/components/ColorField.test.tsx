import { useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ColorField } from "./ColorField";
import type { Color } from "../lib/ops";

beforeEach(() => {
  for (const [method, state] of [
    ["showPopover", "open"],
    ["hidePopover", "closed"],
  ] as const) {
    Object.defineProperty(HTMLElement.prototype, method, {
      configurable: true,
      value() {
        this.style.display = state === "open" ? "block" : "none";
        const event = new Event("toggle");
        Object.defineProperty(event, "newState", { value: state });
        this.dispatchEvent(event);
      },
    });
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setup(alpha = false, initial: Color = { r: 255, g: 0, b: 0, a: 96 }) {
  const onChange = vi.fn();
  function Field() {
    const [value, setValue] = useState(initial);
    return (
      <ColorField
        label="Background"
        value={value}
        alpha={alpha}
        onChange={(next) => {
          onChange(next);
          setValue(next);
        }}
      />
    );
  }
  render(<Field />);
  return {
    onChange,
    open: () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Choose background color" }),
      ),
  };
}

it("lets a partial hex value be edited before committing a valid color", () => {
  const { onChange } = setup();
  const hex = screen.getByRole("textbox", { name: "Background" });
  fireEvent.change(hex, { target: { value: "#12" } });
  expect((hex as HTMLInputElement).value).toBe("#12");
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.change(hex, { target: { value: "12abef" } });
  fireEvent.keyDown(hex, { key: "Enter" });
  expect(onChange).toHaveBeenLastCalledWith({ r: 18, g: 171, b: 239, a: 96 });
  expect((hex as HTMLInputElement).value).toBe("#12ABEF");
});

it("restores the existing color after invalid hex input", () => {
  const { onChange } = setup();
  const hex = screen.getByRole("textbox", { name: "Background" });
  fireEvent.change(hex, { target: { value: "#nope" } });
  fireEvent.blur(hex);
  expect(onChange).not.toHaveBeenCalled();
  expect((hex as HTMLInputElement).value).toBe("#FF0000");
  expect(screen.getByRole("alert").textContent).toBe(
    "Enter a six-digit hex color.",
  );
});

it("cancels a hex draft without dismissing its parent dialog", () => {
  const onKeyDown = vi.fn();
  const onChange = vi.fn();
  render(
    <div onKeyDown={onKeyDown}>
      <ColorField
        label="Background"
        value={{ r: 255, g: 0, b: 0, a: 96 }}
        onChange={onChange}
      />
    </div>,
  );
  const hex = screen.getByRole("textbox", { name: "Background" });
  fireEvent.change(hex, { target: { value: "#12" } });
  fireEvent.keyDown(hex, { key: "Escape" });
  expect((hex as HTMLInputElement).value).toBe("#FF0000");
  expect(onKeyDown).not.toHaveBeenCalled();
  expect(onChange).not.toHaveBeenCalled();
});

it("updates hue and RGB channels while preserving alpha", () => {
  const { onChange, open } = setup();
  open();
  fireEvent.change(screen.getByRole("slider", { name: /Hue/ }), {
    target: { value: "120" },
  });
  expect(onChange).toHaveBeenLastCalledWith({ r: 0, g: 255, b: 0, a: 96 });
  fireEvent.change(
    screen.getByRole("spinbutton", { name: "Background blue" }),
    { target: { value: "300" } },
  );
  expect(onChange).toHaveBeenLastCalledWith({ r: 0, g: 255, b: 255, a: 96 });
});

it("supports keyboard changes on the color surface", () => {
  const { onChange, open } = setup();
  open();
  const surface = screen.getByRole("group", {
    name: "Saturation and brightness",
  });
  fireEvent.keyDown(surface, { key: "ArrowDown", shiftKey: true });
  expect(onChange).toHaveBeenLastCalledWith({ r: 230, g: 0, b: 0, a: 96 });
  fireEvent.keyDown(surface, { key: "ArrowLeft", shiftKey: true });
  expect(onChange).toHaveBeenLastCalledWith({ r: 230, g: 23, b: 23, a: 96 });
});

it("changes opacity only when the alpha control is enabled", () => {
  const { onChange } = setup(true);
  fireEvent.change(screen.getByRole("slider", { name: "Background alpha" }), {
    target: { value: "192" },
  });
  expect(onChange).toHaveBeenLastCalledWith({ r: 255, g: 0, b: 0, a: 192 });
});

it("closes on Escape or native light-dismiss and returns focus", () => {
  const { open } = setup();
  const button = screen.getByRole("button", {
    name: "Choose background color",
  });
  open();
  expect(button.getAttribute("aria-expanded")).toBe("true");
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(button.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(button);
  open();
  act(() => screen.getByRole("dialog").hidePopover());
  expect(button.getAttribute("aria-expanded")).toBe("false");
});

it("dismisses when the surrounding view scrolls while allowing its own panel to scroll", () => {
  const { open } = setup();
  open();
  const button = screen.getByRole("button", {
    name: "Choose background color",
  });
  fireEvent.scroll(screen.getByRole("dialog"));
  expect(button.getAttribute("aria-expanded")).toBe("true");
  fireEvent.scroll(window);
  expect(button.getAttribute("aria-expanded")).toBe("false");
});
