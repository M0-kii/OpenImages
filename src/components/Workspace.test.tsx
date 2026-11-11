import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FIT_VIEWPORT } from "./CanvasView";
import { Workspace } from "./Workspace";
import { useHistory } from "../hooks/useHistory";
import { INITIAL_EDIT, rgb, type EditState } from "../lib/ops";
import { SettingsProvider } from "../state/settings";
import type { ToolId } from "../tools/registry";

const mocks = vi.hoisted(() => ({ outputSize: vi.fn(), usePreview: vi.fn() }));
vi.mock("../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/api")>()),
  outputSize: mocks.outputSize,
}));
vi.mock("../hooks/usePreview", () => ({ usePreview: mocks.usePreview }));

const documentMeta = { id: 1, name: "wide.png", width: 1200, height: 400, hasAlpha: false };
const square = { x: 0, y: 0, width: 1 / 3, height: 1 };

function Editor({ tool, initial = INITIAL_EDIT }: { tool: ToolId; initial?: EditState }) {
  const history = useHistory(initial);
  const [viewport, setViewport] = useState(FIT_VIEWPORT);
  return (
    <SettingsProvider>
      <Workspace
        key={tool}
        tool={tool}
        doc={documentMeta}
        edit={history.present}
        history={history}
        viewport={viewport}
        setViewport={setViewport}
        onPickFile={async () => {}}
        onCloseDoc={() => {}}
        onExport={async () => {}}
        exporting={false}
        formats={["png"]}
        format="png"
        setFormat={() => {}}
        quality={90}
        setQuality={() => {}}
        aspect={null}
        setAspect={() => {}}
        linked
        setLinked={() => {}}
        faviconFiles={[]}
        setFaviconFiles={() => {}}
      />
    </SettingsProvider>
  );
}

beforeEach(() => {
  mocks.outputSize.mockReset().mockResolvedValue([400, 400]);
  mocks.usePreview.mockReset().mockReturnValue({ url: "blob:first", rendering: false, error: null });
});
afterEach(cleanup);

it("uses the square crop's output as the basis for a resize preset and linked dimensions", async () => {
  render(<Editor tool="resize" initial={{ ...INITIAL_EDIT, crop: square }} />);

  fireEvent.click(await screen.findByRole("button", { name: "50%" }));
  const width = screen.getByRole<HTMLInputElement>("spinbutton", { name: "Width" });
  const height = screen.getByRole<HTMLInputElement>("spinbutton", { name: "Height" });
  expect(width.value).toBe("200");
  expect(height.value).toBe("200");
  expect(mocks.outputSize).toHaveBeenCalledWith(1, [{ kind: "crop", ...square }]);

  fireEvent.change(width, { target: { value: "100" } });
  expect(height.value).toBe("100");
  await screen.findByText("Reset to 400×400");
});

it("shows the crop overlay on the oriented image before resize, padding, and effects", async () => {
  render(<Editor tool="crop" initial={{
    ...INITIAL_EDIT,
    rotate: 90,
    flipH: true,
    crop: square,
    resize: { width: 300, height: 200, filter: "triangle" },
    pad: { width: 600, height: 400, anchor: "center", color: rgb(0, 0, 0) },
    exposure: 1,
  }} />);

  expect(mocks.usePreview).toHaveBeenLastCalledWith(1, [
    { kind: "rotate", degrees: 90 },
    { kind: "flip", horizontal: true, vertical: false },
  ]);
  await screen.findByText("400×400");
});

it("keeps zoom and pan across new previews and tool remounts, with 1:1 based on output pixels", () => {
  const { container, rerender } = render(<Editor tool="crop" />);
  fireEvent.wheel(container.querySelector(".canvas")!, { deltaY: -1, clientX: 100, clientY: 80 });
  const transform = () => container.querySelector<HTMLElement>(".viewport")!.style.transform;
  const previous = transform();
  expect(previous).not.toContain("translate(0px, 0px)");
  expect(previous).toContain("scale(1.12)");

  mocks.usePreview.mockReturnValue({ url: "blob:second", rendering: false, error: null });
  rerender(<Editor tool="crop" />);
  expect(transform()).toBe(previous);
  rerender(<Editor tool="resize" />);
  expect(transform()).toBe(previous);

  Object.defineProperties(screen.getByRole("img", { name: "preview" }), {
    clientWidth: { value: 300 },
    naturalWidth: { value: 800 },
  });
  fireEvent.click(screen.getByRole("button", { name: "1:1" }));
  expect(transform()).toBe("translate(0px, 0px) scale(4)");
});
