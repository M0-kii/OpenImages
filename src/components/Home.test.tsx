import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Home } from "./Home";
import { Sidebar } from "./Sidebar";
import { useState } from "react";
import { TOOLS, type CategoryId } from "../tools/registry";

afterEach(cleanup);

function setup() {
  const actions = { onOpen: vi.fn(), onPickFile: vi.fn(), onSettings: vi.fn() };
  function Library() {
    const [category, setCategory] = useState<CategoryId | "all">("all");
    return (
      <>
        <Sidebar
          category={category}
          onCategoryChange={setCategory}
          onSettings={actions.onSettings}
        />
        <Home
          onOpen={actions.onOpen}
          onPickFile={actions.onPickFile}
          category={category}
          onCategoryChange={setCategory}
        />
      </>
    );
  }
  const view = render(<Library />);
  return { ...actions, ...view };
}

it("combines category and ranked search, and opens the displayed first result", () => {
  const { onOpen } = setup();
  fireEvent.click(screen.getByRole("button", { name: /^Output/ }));
  expect(screen.getAllByRole("listitem")).toHaveLength(
    TOOLS.filter((t) => t.category === "output").length,
  );
  expect(screen.queryByRole("button", { name: /^Crop / })).toBeNull();

  const search = screen.getByRole("textbox", { name: "Search tools" });
  fireEvent.change(search, { target: { value: "icon" } });
  const results = within(screen.getByRole("list", { name: "Search results" }));
  expect(results.getAllByRole("button")[0].textContent).toContain("Favicon Set");
  fireEvent.keyDown(search, { key: "Enter" });
  expect(onOpen).toHaveBeenCalledWith("favicon");
});

it("recovers from an empty category search by clearing both filters", () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: /^Effects/ }));
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "favicon" },
  });
  expect(screen.getByRole("status").textContent).toContain("No tools found");
  fireEvent.click(screen.getByRole("button", { name: "Show all tools" }));
  expect(screen.getAllByRole("listitem")).toHaveLength(TOOLS.length);
  expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("");
});

it("opens images and settings from the library controls", () => {
  const { onPickFile, onSettings } = setup();
  fireEvent.click(screen.getByRole("button", { name: "Open image" }));
  expect(onPickFile).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
  expect(onSettings).toHaveBeenCalledOnce();
  expect(screen.queryByText("On your device.")).toBeNull();
});

it("focuses search with slash and lets Escape clear it", () => {
  setup();
  fireEvent.keyDown(window, { key: "/" });
  const search = screen.getByRole("textbox");
  expect(document.activeElement).toBe(search);
  fireEvent.change(search, { target: { value: "crop" } });
  fireEvent.keyDown(search, { key: "Escape" });
  expect((search as HTMLInputElement).value).toBe("");
});

it("does not move focus from an open menu when slash is pressed", () => {
  const { container } = setup();
  const menu = document.createElement("div");
  menu.setAttribute("role", "menu");
  const action = document.createElement("button");
  action.textContent = "Open image";
  menu.append(action);
  container.append(menu);
  action.focus();
  fireEvent.keyDown(action, { key: "/" });
  expect(document.activeElement).toBe(action);
});
