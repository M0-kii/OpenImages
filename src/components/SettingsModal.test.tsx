import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import { version } from "../../package.json";
import { SettingsModal } from "./SettingsModal";
import { SettingsProvider } from "../state/settings";
import { TOOLS } from "../tools/registry";

const openUrl = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl }));
const showModal = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  "showModal",
);
const close = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  "close",
);

beforeAll(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = true;
      },
    },
    close: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = false;
      },
    },
  });
});
beforeEach(() => {
  localStorage.clear();
  openUrl.mockReset();
  openUrl.mockResolvedValue(undefined);
});
afterEach(cleanup);
afterAll(() => {
  if (showModal)
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", showModal);
  else
    delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>)
      .showModal;
  if (close) Object.defineProperty(HTMLDialogElement.prototype, "close", close);
  else delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close;
});

function setup() {
  const onClose = vi.fn();
  render(
    <SettingsProvider>
      <SettingsModal formats={["png", "jpeg", "webp"]} onClose={onClose} />
    </SettingsProvider>,
  );
  return onClose;
}

it("shows source-backed About details and keeps GitHub in every settings section", () => {
  setup();
  const github = screen.getByRole("link", { name: "GitHub" });
  for (const pane of ["Canvas", "Export", "About", "Appearance"]) {
    fireEvent.click(screen.getByRole("button", { name: pane }));
    expect(screen.getByRole("link", { name: "GitHub" })).toBe(github);
    expect(screen.getByRole("heading", { name: pane })).toBeTruthy();
  }
  fireEvent.click(screen.getByRole("button", { name: "About" }));
  expect(screen.getByText(version)).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "M0-kii" }).getAttribute("href"),
  ).toBe("https://github.com/M0-kii");
  expect(
    screen
      .getByRole("link", { name: "M0-kii / OpenImages" })
      .getAttribute("href"),
  ).toBe("https://github.com/M0-kii/OpenImages");
  expect(screen.getByText("Not specified")).toBeTruthy();
  expect(screen.getByText(String(TOOLS.length))).toBeTruthy();
  expect(screen.getByText("PNG · JPEG · WEBP")).toBeTruthy();
  expect(
    screen.getByRole("img", { name: "OpenImages logo" }).getAttribute("src"),
  ).toBe("/logo.svg");
});

it("opens repository and creator links externally and reports an opener failure", async () => {
  setup();
  fireEvent.click(screen.getByRole("link", { name: "GitHub" }));
  expect(openUrl).toHaveBeenLastCalledWith(
    "https://github.com/M0-kii/OpenImages",
  );
  fireEvent.click(screen.getByRole("button", { name: "About" }));
  fireEvent.click(screen.getByRole("link", { name: "M0-kii" }));
  expect(openUrl).toHaveBeenLastCalledWith("https://github.com/M0-kii");
  openUrl.mockRejectedValueOnce(new Error("Unavailable"));
  fireEvent.click(screen.getByRole("link", { name: "M0-kii / OpenImages" }));
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain(
      "Could not open the link",
    ),
  );
});

it("preserves appearance, canvas, export, and restore-default controls", () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Light" }));
  expect(document.documentElement.dataset.theme).toBe("light");
  fireEvent.click(screen.getByRole("switch", { name: "Reduce motion" }));
  expect(document.documentElement.classList.contains("no-motion")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Canvas" }));
  fireEvent.click(
    screen.getByRole("switch", { name: "Transparency checkerboard" }),
  );
  expect(document.documentElement.classList.contains("no-checker")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Export" }));
  expect(
    screen.getByRole("combobox", { name: "Default format" }).textContent,
  ).toBe("PNG");
  fireEvent.change(
    screen.getByRole("slider", { name: "Default JPEG quality" }),
    { target: { value: "76" } },
  );
  expect(
    JSON.parse(localStorage.getItem("openimages.settings")!).defaultQuality,
  ).toBe(76);
  expect(
    screen.getByRole("textbox", { name: "Matte for opaque formats" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Restore defaults" }));
  const settings = JSON.parse(localStorage.getItem("openimages.settings")!);
  expect(settings.defaultQuality).toBe(90);
  expect(settings.theme).toBe("dark");
  expect(settings.checkerboard).toBe(true);
});

it("handles native Escape cancellation and the close button", () => {
  const onClose = setup();
  const dialog = screen.getByRole("dialog", { name: "Settings" });
  const cancel = new Event("cancel", { cancelable: true });
  fireEvent(dialog, cancel);
  expect(cancel.defaultPrevented).toBe(true);
  expect(onClose).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
  expect(onClose).toHaveBeenCalledTimes(2);
});
