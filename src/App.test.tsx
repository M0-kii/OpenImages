import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "./App";
import { INITIAL_EDIT } from "./lib/ops";
import { readRecovery, writeRecovery } from "./lib/recovery";
import { SettingsProvider } from "./state/settings";

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  save: vi.fn(),
  message: vi.fn(),
  openImage: vi.fn(),
  exportImage: vi.fn(),
  closeImage: vi.fn(),
  onDragDropEvent: vi.fn(),
  win: {
    isMaximized: vi.fn(async () => false),
    onResized: vi.fn(async () => () => {}),
    onCloseRequested: vi.fn(),
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
  },
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => mocks.win,
}));
vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({ onDragDropEvent: mocks.onDragDropEvent }),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: mocks.open,
  save: mocks.save,
  message: mocks.message,
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
  openImage: mocks.openImage,
  closeImage: mocks.closeImage,
  exportImage: mocks.exportImage,
  outputSize: async () => [1200, 400],
  OPAQUE_FORMATS: ["jpeg"],
}));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.open.mockReset();
  mocks.save.mockReset();
  mocks.message.mockReset().mockResolvedValue("Ok");
  mocks.openImage.mockReset().mockResolvedValue({
    id: 1, name: "sample.png", width: 1200, height: 400, hasAlpha: false,
  });
  mocks.closeImage.mockReset().mockResolvedValue(undefined);
  mocks.exportImage.mockReset().mockResolvedValue(undefined);
  mocks.onDragDropEvent.mockResolvedValue(() => {});
  mocks.win.onCloseRequested.mockResolvedValue(() => {});
});
afterEach(cleanup);

it("queues picked and dropped images without opening a document and retains them across tabs", async () => {
  render(<SettingsProvider><App /></SettingsProvider>);
  fireEvent.click(screen.getByRole("button", { name: /^Batch Export/ }));
  await screen.findByRole("heading", { name: "Batch Export" });

  act(() => {
    mocks.onDragDropEvent.mock.lastCall?.[0]({
      payload: { type: "drop", paths: ["test/first.png", "test/second.png"] },
    });
  });
  expect(screen.getByText("first.png")).toBeTruthy();
  expect(screen.getByText("second.png")).toBeTruthy();

  mocks.open.mockResolvedValueOnce(["test/third.png"]);
  fireEvent.keyDown(window, { key: "o", ctrlKey: true });
  await screen.findByText("third.png");
  expect(mocks.open).toHaveBeenCalledWith(expect.objectContaining({ multiple: true }));
  expect(mocks.openImage).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("tab", { name: "Home" }));
  fireEvent.click(screen.getByRole("tab", { name: /^Batch Export/ }));
  expect(screen.getByRole("list", { name: "Batch queue" }).children).toHaveLength(3);
});

it("keeps tabs in the title bar and exposes appearance choices through the expanding menu", async () => {
  render(
    <SettingsProvider>
      <App />
    </SettingsProvider>,
  );
  expect(screen.getByRole("tablist").closest("header")).toBeTruthy();
  expect(screen.queryByRole("menubar")).toBeNull();
  expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
  expect(
    screen.queryByRole("button", { name: /Switch to .* theme/ }),
  ).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Show application menu" }),
  );
  fireEvent.click(screen.getByRole("menuitem", { name: "View" }));
  fireEvent.click(
    screen.getByRole("menuitemcheckbox", { name: "Light appearance" }),
  );
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(JSON.parse(localStorage.getItem("openimages.settings")!).theme).toBe(
    "light",
  );
  fireEvent.click(screen.getByRole("menuitem", { name: "View" }));
  fireEvent.click(
    screen.getByRole("menuitemcheckbox", { name: "Dark appearance" }),
  );
  expect(document.documentElement.dataset.theme).toBe("dark");
  fireEvent.click(
    screen.getByRole("button", { name: "Hide application menu" }),
  );
  expect(screen.queryByRole("menubar")).toBeNull();
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
  fireEvent.click(
    screen.getByRole("button", { name: "Show application menu" }),
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
  fireEvent.click(screen.getByRole("button", { name: /^Settings/ }));
  const close = screen.getByRole("button", { name: "Close settings" });
  fireEvent.keyDown(close, { key: "w", ctrlKey: true });
  fireEvent.keyDown(close, { key: "o", ctrlKey: true });
  expect(screen.getByRole("tab", { name: /Crop/ })).toBeTruthy();
  expect(mocks.open).toHaveBeenCalledTimes(1);
  fireEvent.click(close);
  fireEvent.keyDown(window, { key: "w", ctrlKey: true });
  expect(screen.queryByRole("tab", { name: /Crop/ })).toBeNull();
});

it("undoes separate clicks and restores shared edits from menus, sliders, and the toolbar", async () => {
  mocks.open.mockResolvedValue("sample.png");
  render(
    <SettingsProvider>
      <App />
    </SettingsProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Open image" }));
  await screen.findByRole("heading", { name: "Crop" });
  fireEvent.click(screen.getByRole("tab", { name: "Home" }));
  fireEvent.click(screen.getByRole("button", { name: /^Rotate & Flip/ }));
  const rotate = screen.getByRole("button", { name: "↻ 90°" });
  fireEvent.click(rotate);
  fireEvent.click(rotate);
  expect(screen.getByText("180°")).toBeTruthy();

  fireEvent.click(
    screen.getByRole("button", { name: "Show application menu" }),
  );
  fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
  fireEvent.click(screen.getByRole("menuitem", { name: /^Undo/ }));
  expect(screen.getByText("90°", { selector: "strong" })).toBeTruthy();

  fireEvent.click(screen.getByRole("tab", { name: "Home" }));
  fireEvent.click(screen.getByRole("button", { name: /^Color Adjust/ }));
  const brightness = screen.getByRole("slider", {
    name: "Brightness",
  }) as HTMLInputElement;
  brightness.focus();
  fireEvent.change(brightness, { target: { value: "30" } });
  fireEvent.keyDown(brightness, { key: "z", ctrlKey: true });
  expect(brightness.value).toBe("0");
  fireEvent.keyDown(brightness, { key: "Z", ctrlKey: true, shiftKey: true });
  expect(brightness.value).toBe("30");

  fireEvent.click(screen.getByRole("button", { name: "Reset" }));
  expect(brightness.value).toBe("0");
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(brightness.value).toBe("30");
  fireEvent.click(screen.getByRole("tab", { name: /Rotate & Flip/ }));
  expect(screen.getByText("90°", { selector: "strong" })).toBeTruthy();
});

it("warns before flattening color-key transparency in a JPEG export", async () => {
  localStorage.setItem(
    "openimages.settings",
    JSON.stringify({ defaultFormat: "jpeg" }),
  );
  mocks.open.mockResolvedValue("sample.png");
  mocks.save.mockResolvedValue("sample-edited.jpeg");
  mocks.exportImage.mockResolvedValue(undefined);
  render(
    <SettingsProvider>
      <App />
    </SettingsProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /^Color Key/ }));
  fireEvent.click(screen.getByRole("button", { name: "Open an image" }));
  const key = await screen.findByRole("button", { name: "Remove matching color" });
  expect(screen.queryByText(/transparency →/)).toBeNull();

  fireEvent.click(key);
  expect(screen.getByText(/transparency →/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Export" }));
  await waitFor(() =>
    expect(mocks.exportImage).toHaveBeenCalledWith(
      1,
      [{ kind: "colorKey", color: { r: 0, g: 255, b: 0, a: 255 }, tolerance: 15 }],
      "sample-edited.jpeg",
      "jpeg",
      90,
      { r: 255, g: 255, b: 255, a: 255 },
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(screen.queryByText(/transparency →/)).toBeNull();
});

async function openAndRotate() {
  mocks.open.mockResolvedValueOnce("sample.png");
  render(<SettingsProvider><App /></SettingsProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Open image" }));
  await screen.findByRole("heading", { name: "Crop" });
  fireEvent.click(screen.getByRole("tab", { name: "Home" }));
  fireEvent.click(screen.getByRole("button", { name: /^Rotate & Flip/ }));
  fireEvent.click(screen.getByRole("button", { name: "↻ 90°" }));
}

it("preserves edits on cancelled and failed replacements, then clears them after a successful drop", async () => {
  await openAndRotate();
  expect(readRecovery()?.edit.rotate).toBe(90);

  mocks.open.mockResolvedValueOnce("other.png");
  mocks.message.mockResolvedValueOnce("Cancel");
  await act(async () => fireEvent.keyDown(window, { key: "o", ctrlKey: true }));
  expect(mocks.openImage).toHaveBeenCalledTimes(1);
  expect(readRecovery()?.edit.rotate).toBe(90);

  const dropImage = () => mocks.onDragDropEvent.mock.lastCall?.[0]({
    payload: { type: "drop", paths: ["other.png"] },
  });
  mocks.message.mockResolvedValueOnce("Discard");
  mocks.openImage.mockRejectedValueOnce(new Error("invalid image"));
  await act(async () => dropImage());
  expect(mocks.closeImage).not.toHaveBeenCalled();
  expect(readRecovery()?.edit.rotate).toBe(90);
  expect(screen.getByText("90°", { selector: "strong" })).toBeTruthy();

  mocks.message.mockResolvedValueOnce("Discard");
  mocks.openImage.mockResolvedValueOnce({
    id: 2, name: "other.png", width: 400, height: 400, hasAlpha: false,
  });
  await act(async () => dropImage());
  expect(mocks.closeImage).toHaveBeenCalledWith(1);
  expect(readRecovery()).toBeNull();
  expect(screen.getByRole("tab", { name: /other\.png/, selected: true })).toBeTruthy();
});

it("keeps the window open until a requested export succeeds", async () => {
  await openAndRotate();
  const requestClose = mocks.win.onCloseRequested.mock.lastCall?.[0];
  const event = { preventDefault: vi.fn() };

  mocks.message.mockResolvedValueOnce("Export");
  mocks.save.mockResolvedValueOnce(null);
  await act(async () => requestClose(event));
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(mocks.exportImage).not.toHaveBeenCalled();
  expect(readRecovery()?.edit.rotate).toBe(90);

  mocks.message.mockResolvedValueOnce("Export");
  mocks.save.mockResolvedValueOnce("edited.png");
  mocks.exportImage.mockRejectedValueOnce(new Error("write failed"));
  await act(async () => requestClose(event));
  expect(event.preventDefault).toHaveBeenCalledTimes(2);
  expect(readRecovery()?.edit.rotate).toBe(90);

  mocks.message.mockResolvedValueOnce("Export");
  mocks.save.mockResolvedValueOnce("edited.png");
  await act(async () => requestClose(event));
  expect(mocks.exportImage).toHaveBeenLastCalledWith(1, [{ kind: "rotate", degrees: 90 }], "edited.png", "png", 90, { r: 255, g: 255, b: 255, a: 255 });
  expect(event.preventDefault).toHaveBeenCalledTimes(2);
  expect(readRecovery()).toBeNull();
});

it("retains a failed recovery and retries with the same edits from the File menu", async () => {
  const draft = {
    version: 1 as const,
    path: "sample.png",
    image: { name: "sample.png", width: 1200, height: 400 },
    edit: { ...INITIAL_EDIT, rotate: 90 },
    format: "jpeg" as const,
    quality: 83,
  };
  writeRecovery(draft);
  mocks.message.mockResolvedValueOnce("Restore");
  mocks.openImage.mockRejectedValueOnce(new Error("source missing"));
  render(<SettingsProvider><App /></SettingsProvider>);
  await waitFor(() => expect(mocks.message).toHaveBeenCalledWith(
    expect.stringContaining("source missing"), expect.objectContaining({ title: "Could not restore edits" }),
  ));
  expect(readRecovery()).toEqual(draft);

  mocks.message.mockResolvedValueOnce("Restore");
  fireEvent.click(screen.getByRole("button", { name: "Show application menu" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "File" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Recover unfinished edits…" }));
  await screen.findByRole("heading", { name: "Crop" });
  fireEvent.click(screen.getByRole("tab", { name: "Home" }));
  fireEvent.click(screen.getByRole("button", { name: /^Rotate & Flip/ }));
  expect(screen.getByText("90°", { selector: "strong" })).toBeTruthy();
  expect(readRecovery()).toEqual(draft);
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(readRecovery()).toBeNull();
});

it("ignores a recovery record with missing edit state fields", () => {
  localStorage.setItem("openimages.recovery", JSON.stringify({
    version: 1,
    path: "sample.png",
    image: { name: "sample.png", width: 1200, height: 400 },
    edit: { rotate: 90 },
    format: "png",
    quality: 90,
  }));
  expect(readRecovery()).toBeNull();
});
