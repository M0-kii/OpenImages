import { describe, expect, it } from "vitest";
import { searchTools, toolById, TOOLS } from "./registry";

const top = (q: string) => searchTools(q)[0]?.name ?? "(none)";

describe("registry", () => {
  it("has unique ids", () => {
    const ids = TOOLS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolves every id", () => {
    for (const t of TOOLS) expect(toolById(t.id)).toBe(t);
  });

  it("only marks tools without export as needing an explicit format", () => {
    // needsFormat exists precisely to show format controls where hasExport hides
    // them. Setting both is redundant and signals a mistake.
    for (const t of TOOLS) {
      if (t.needsFormat) expect(t.hasExport, `${t.id}`).toBe(false);
    }
  });
});

describe("searchTools", () => {
  it("returns everything for an empty query", () => {
    expect(searchTools("")).toHaveLength(TOOLS.length);
    expect(searchTools("   ")).toHaveLength(TOOLS.length);
  });

  it("returns nothing for nonsense", () => {
    expect(searchTools("zzzzq")).toHaveLength(0);
  });

  it("is case and whitespace insensitive", () => {
    expect(top("  CROP ")).toBe("Crop");
  });

  it.each([
    ["crop", "Crop"],
    ["resize", "Resize"],
    ["convert", "Convert"],
  ])("ranks an exact name match first: %s", (q, want) => {
    expect(top(q)).toBe(want);
  });

  it.each([
    // The keyword someone actually types -> the tool they actually want.
    ["ico", "Favicon Set"],
    ["favicon", "Favicon Set"],
    ["pwa", "Favicon Set"],
    ["apple touch", "Favicon Set"],
    ["compress", "Convert"],
    ["webp", "Convert"],
    ["jpg", "Convert"],
    ["black and white", "Filters"],
    ["greyscale", "Filters"],
    ["mirror", "Rotate & Flip"],
    ["upside down", "Rotate & Flip"],
    ["thumbnail", "Resize"],
    ["colour", "Color Adjust"],
    ["gaussian", "Blur & Sharpen"],
    ["avatar", "Circle Crop"],
    ["pfp", "Circle Crop"],
    ["censor", "Pixelate"],
    ["redact", "Pixelate"],
    ["base64", "Data URI"],
    ["data url", "Data URI"],
    ["hex", "Color Palette"],
    ["swatch", "Color Palette"],
    ["white balance", "Temperature & Tint"],
    ["kelvin", "Temperature & Tint"],
    ["border radius", "Rounded Corners"],
    ["squircle", "Rounded Corners"],
    ["sobel", "Edge Detect"],
    ["stencil", "Threshold"],
    ["1-bit", "Threshold"],
    ["gradient map", "Duotone"],
    ["quantize", "Posterize"],
    ["letterbox", "Canvas & Padding"],
    ["normalize", "Auto Contrast"],
    ["midtones", "Gamma"],
    ["black point", "Levels"],
    ["vintage", "Sepia"],
    ["box shadow", "Drop Shadow"],
    ["mockup", "Drop Shadow"],
    ["transparency", "Opacity"],
    ["outline", "Border"],
    ["bulk", "Batch Export"],
    ["resize all", "Batch Export"],
  ])("finds %s -> %s", (q, want) => {
    expect(top(q)).toBe(want);
  });

  it('resolves the "film" collision toward grain, not sepia', () => {
    // Both tools once claimed "film" as an exact keyword, and the tie fell to
    // whichever appeared first in TOOLS. Film means grain.
    expect(top("film")).toBe("Grain & Noise");
  });

  it("prefers a name match over a keyword match", () => {
    // "Border" matches by name; "Rounded Corners" only via the keyword
    // "border radius". The name must win.
    const names = searchTools("border").map((t) => t.name);
    expect(names[0]).toBe("Border");
    expect(names).toContain("Rounded Corners");
    expect(names.indexOf("Border")).toBeLessThan(names.indexOf("Rounded Corners"));
  });

  it("prefers a prefix match over a mid-string match", () => {
    const names = searchTools("bo").map((t) => t.name);
    expect(names[0]).toBe("Border");
  });
});
