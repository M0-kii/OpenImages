import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TitleBar } from "./TitleBar";

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    isMaximized: async () => false,
    onResized: async () => () => {},
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("moves the tab strip from its current position and cancels the previous motion on reversal", () => {
  const cancel = vi.fn();
  const animate = vi.fn(() => ({ cancel }));
  const actions = { onHome: vi.fn(), onSelect: vi.fn(), onClose: vi.fn() };
  const { container } = render(
    <TitleBar
      {...actions}
      reduceMotion={false}
      activeId="crop"
      tabs={[{ id: "crop", toolId: "crop", docName: null }]}
      menus={[
        { label: "File", items: [{ label: "Open image", onSelect: vi.fn() }] },
      ]}
    />,
  );
  const tabs = container.querySelector<HTMLElement>(".titlebar__tabs")!;
  Object.defineProperty(tabs, "animate", { value: animate });
  vi.spyOn(tabs, "getBoundingClientRect")
    .mockReturnValueOnce({ left: 180 } as DOMRect)
    .mockReturnValueOnce({ left: 330 } as DOMRect)
    .mockReturnValueOnce({ left: 260 } as DOMRect)
    .mockReturnValueOnce({ left: 180 } as DOMRect);
  fireEvent.click(
    screen.getByRole("button", { name: "Show application menu" }),
    { detail: 1 },
  );
  expect(animate).toHaveBeenCalledWith(
    [{ transform: "translateX(-150px)" }, { transform: "translateX(0)" }],
    expect.objectContaining({ duration: 240 }),
  );
  expect(screen.getByRole("menuitem", { name: "File" })).toBeTruthy();
  expect(
    screen.getByRole("tab", { name: /Crop/ }).getAttribute("aria-selected"),
  ).toBe("true");
  fireEvent.click(
    screen.getByRole("button", { name: "Hide application menu" }),
    { detail: 1 },
  );
  expect(cancel).toHaveBeenCalledOnce();
  expect(animate).toHaveBeenLastCalledWith(
    [{ transform: "translateX(80px)" }, { transform: "translateX(0)" }],
    expect.anything(),
  );
  expect(screen.queryByRole("menubar")).toBeNull();
});

it("opens the menu without moving the tabs when reduced motion is enabled", () => {
  const animate = vi.fn();
  const { container } = render(
    <TitleBar
      onHome={vi.fn()}
      onSelect={vi.fn()}
      onClose={vi.fn()}
      reduceMotion
      activeId="home"
      tabs={[{ id: "home", toolId: null, docName: null }]}
      menus={[]}
    />,
  );
  Object.defineProperty(container.querySelector(".titlebar__tabs"), "animate", {
    value: animate,
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Show application menu" }),
    { detail: 1 },
  );
  expect(animate).not.toHaveBeenCalled();
  fireEvent.keyDown(
    screen.getByRole("button", { name: "Hide application menu" }),
    { key: "Escape" },
  );
  expect(
    screen
      .getByRole("button", { name: "Show application menu" })
      .getAttribute("aria-expanded"),
  ).toBe("false");
});
