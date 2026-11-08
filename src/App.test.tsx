import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "./App";
import { SettingsProvider } from "./state/settings";

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  save: vi.fn(),
  exportImage: vi.fn(),
  closeImage: vi.fn(),
  win: {
    isMaximized: vi.fn(async () => false),
    onResized: vi.fn(async () => () => {}),
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
  },
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => mocks.win,
}));
vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({ onDragDropEvent: async () => () => {} }),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: mocks.open,
  save: mocks.save,
  message: vi.fn(),
}));
vi.mock("./hooks/usePreview", () => ({
  usePreview: () => ({ url: null, rendering: false, error: null }),
}));
vi.mock("./components/SettingsModal", () => ({
  SettingsModal: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog">
      <button onClick={onClose}>Close settings</button>
    </div>
  ),
}));
vi.mock("./lib/api", () => ({
  supportedFormats: async () => ["png", "jpeg"],
  openImage: async () => ({
    id: 1,
    name: "sample.png",
    width: 1200,
    height: 400,
    hasAlpha: false,
  }),
  closeImage: mocks.closeImage,
  exportImage: mocks.exportImage,
  outputSize: async () => [1200, 400],
  OPAQUE_FORMATS: ["jpeg"],
}));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
afterEach(cleanup);

it("toggles and saves the appearance from the title bar", async () => {
  render(
    <SettingsProvider>
      <App />
    </SettingsProvider>,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Switch to light theme" }),
  );
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(JSON.parse(localStorage.getItem("openimages.settings")!).theme).toBe(
    "light",
  );
  fireEvent.click(screen.getByRole("button", { name: "Switch to dark theme" }));
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(screen.queryByText("On your device.")).toBeNull();
  await waitFor(() => expect(mocks.win.isMaximized).toHaveBeenCalled());
});

it("opens and exports from the menubar while the sidebar remains available", async () => {
  mocks.open.mockResolvedValue("sample.png");
  mocks.save.mockResolvedValue("sample-edited.png");
  mocks.exportImage.mockResolvedValue(undefined);
  render(
    <SettingsProvider>
      <App />
    </SettingsProvider>,
  );
  fireEvent.click(screen.getByRole("menuitem", { name: "File" }));
  expect(
    (
      screen.getByRole("menuitem", {
        name: /Export image/,
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("menuitem", { name: /Open image/ }));
  await screen.findByRole("heading", { name: "Crop" });
  expect(
    screen.getByRole("navigation", { name: "Tool categories" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("menuitem", { name: "File" }));
  fireEvent.click(screen.getByRole("menuitem", { name: /Export image/ }));
  await waitFor(() =>
    expect(mocks.exportImage).toHaveBeenCalledWith(
      1,
      [],
      "sample-edited.png",
      "png",
      90,
      { r: 255, g: 255, b: 255, a: 255 },
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: /^Color/ }));
  expect(screen.getByRole("heading", { name: /^Color/ })).toBeTruthy();
  expect(screen.getByRole("tab", { name: /Crop/ })).toBeTruthy();
});

it("keeps background commands from acting through Settings", async () => {
  mocks.open.mockResolvedValue("sample.png");
  render(
    <SettingsProvider>
      <App />
    </SettingsProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Open image" }));
  await screen.findByRole("heading", { name: "Crop" });
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  const close = screen.getByRole("button", { name: "Close settings" });
  fireEvent.keyDown(close, { key: "w", ctrlKey: true });
  fireEvent.keyDown(close, { key: "o", ctrlKey: true });
  expect(screen.getByRole("tab", { name: /Crop/ })).toBeTruthy();
  expect(mocks.open).toHaveBeenCalledTimes(1);
  fireEvent.click(close);
  fireEvent.keyDown(window, { key: "w", ctrlKey: true });
  expect(screen.queryByRole("tab", { name: /Crop/ })).toBeNull();
});
