import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Home } from "./Home";
import { TOOLS } from "../tools/registry";

afterEach(cleanup);

function setup() {
  const actions = { onOpen: vi.fn(), onPickFile: vi.fn(), onSettings: vi.fn() };
  const view = render(<Home {...actions} />);
  return { ...actions, ...view };
}

it("combines category and ranked search, and opens the displayed first result", () => {
  const { onOpen, container } = setup();
  fireEvent.click(screen.getByRole("button", { name: /^Output/ }));
  expect(container.querySelectorAll(".tool-card")).toHaveLength(
    TOOLS.filter((t) => t.category === "output").length,
  );
  expect(screen.queryByRole("button", { name: /^Crop / })).toBeNull();

  const search = screen.getByRole("textbox", { name: "Search tools" });
  fireEvent.change(search, { target: { value: "icon" } });
  expect(container.querySelector(".tool-card__name")?.textContent).toBe(
    "Favicon Set",
  );
  fireEvent.keyDown(search, { key: "Enter" });
  expect(onOpen).toHaveBeenCalledWith("favicon");
});

it("recovers from an empty category search by clearing both filters", () => {
  const { container } = setup();
  fireEvent.click(screen.getByRole("button", { name: /^Effects/ }));
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "favicon" },
  });
  expect(screen.getByRole("status").textContent).toContain("No tools found");
  fireEvent.click(screen.getByRole("button", { name: "Show all tools" }));
  expect(container.querySelectorAll(".tool-card")).toHaveLength(TOOLS.length);
  expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("");
});

it("opens images and settings from the library controls", () => {
  const { onPickFile, onSettings } = setup();
  fireEvent.click(screen.getByRole("button", { name: "Open an image" }));
  fireEvent.click(screen.getByRole("button", { name: "Open image" }));
  expect(onPickFile).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
  expect(onSettings).toHaveBeenCalledOnce();
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
