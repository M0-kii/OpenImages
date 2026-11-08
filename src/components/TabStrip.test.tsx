import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TabStrip, type Tab } from "./TabStrip";

afterEach(cleanup);

it("navigates tabs by keyboard without treating close-button keys as tab selection", () => {
  const tabs: Tab[] = [
    { id: "home", toolId: null, docName: null },
    { id: "crop", toolId: "crop", docName: null },
    { id: "resize", toolId: "resize", docName: null },
  ];
  const onSelect = vi.fn();
  const onClose = vi.fn();
  render(
    <TabStrip
      tabs={tabs}
      activeId="home"
      onSelect={onSelect}
      onClose={onClose}
    />,
  );
  const items = screen.getAllByRole("tab");
  fireEvent.keyDown(items[0], { key: "ArrowLeft" });
  expect(onSelect).toHaveBeenLastCalledWith("resize");
  expect(document.activeElement).toBe(items[2]);
  fireEvent.keyDown(items[2], { key: "Home" });
  expect(onSelect).toHaveBeenLastCalledWith("home");
  fireEvent.keyDown(items[0], { key: "End" });
  expect(onSelect).toHaveBeenLastCalledWith("resize");
  fireEvent.keyDown(items[1], { key: " " });
  expect(onSelect).toHaveBeenLastCalledWith("crop");
  onSelect.mockClear();
  fireEvent.keyDown(screen.getByRole("button", { name: "Close Crop" }), {
    key: "Enter",
  });
  expect(onSelect).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Close Crop" }));
  expect(onClose).toHaveBeenCalledWith("crop");
  expect(onSelect).not.toHaveBeenCalled();
});
