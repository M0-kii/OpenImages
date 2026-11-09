import { describe, expect, it } from "vitest";
import { buildOps, fromHex, INITIAL_EDIT, isDirty, rgb, toHex, type EditState } from "./ops";

const edit = (over: Partial<EditState> = {}): EditState => ({ ...INITIAL_EDIT, ...over });
const kinds = (e: EditState) => buildOps(e).map((o) => o.kind);

describe("hex colors", () => {
  it("round-trips", () => {
    expect(toHex(rgb(255, 0, 128))).toBe("#ff0080");
    expect(fromHex("#ff0080")).toEqual({ r: 255, g: 0, b: 128, a: 255 });
  });

  it("accepts a missing hash and preserves alpha", () => {
    expect(fromHex("00ff00", 40)).toEqual({ r: 0, g: 255, b: 0, a: 40 });
  });

  it("pads single-digit channels", () => {
    expect(toHex(rgb(1, 2, 3))).toBe("#010203");
  });
});

describe("isDirty", () => {
  it("is false for a pristine edit", () => {
    expect(isDirty(INITIAL_EDIT)).toBe(false);
  });

  it("notices a nested change", () => {
    expect(isDirty(edit({ vignette: { amount: 10, radius: 60, softness: 45 } }))).toBe(true);
  });
});

describe("buildOps", () => {
  it("emits nothing for a pristine edit", () => {
    expect(buildOps(INITIAL_EDIT)).toEqual([]);
  });

  it("omits identity values rather than emitting no-op operations", () => {
    // Every one of these is its neutral value; none should reach the backend.
    expect(
      kinds(
        edit({
          gamma: 1,
          opacity: 100,
          posterize: 1,
          pixelate: 1,
          threshold: null,
          levels: { black: 0, white: 255 },
          temperature: { temp: 0, tint: 0 },
          sepia: 0,
          blur: 0,
          sharpen: 0,
        }),
      ),
    ).toEqual([]);
  });

  it("emits posterize only at two levels or more", () => {
    expect(kinds(edit({ posterize: 1 }))).toEqual([]);
    expect(kinds(edit({ posterize: 2 }))).toEqual(["posterize"]);
  });

  it("emits threshold when it is zero but not when it is null", () => {
    // 0 is a legitimate cutoff; null means the tool is off. `if (x)` would be a bug.
    expect(kinds(edit({ threshold: null }))).toEqual([]);
    expect(kinds(edit({ threshold: 0 }))).toEqual(["threshold"]);
  });

  it("emits pixelate only above a block size of one", () => {
    expect(kinds(edit({ pixelate: 1 }))).toEqual([]);
    expect(kinds(edit({ pixelate: 2 }))).toEqual(["pixelate"]);
  });

  it("skips a zero-opacity drop shadow", () => {
    const off = edit({ shadow: { ...INITIAL_EDIT.shadow, opacity: 0 } });
    const on = edit({ shadow: { ...INITIAL_EDIT.shadow, opacity: 50 } });
    expect(kinds(off)).toEqual([]);
    expect(kinds(on)).toEqual(["dropShadow"]);
  });

  it("treats rotate as modular", () => {
    expect(kinds(edit({ rotate: 360 }))).toEqual([]);
    expect(buildOps(edit({ rotate: 450 }))[0]).toEqual({ kind: "rotate", degrees: 90 });
  });

  it("prefers circleCrop over roundCorners when both are set", () => {
    // Rounding a circle is meaningless; the circle wins.
    expect(kinds(edit({ circle: true, round: 20 }))).toEqual(["circleCrop"]);
    expect(kinds(edit({ circle: false, round: 20 }))).toEqual(["roundCorners"]);
  });

  describe("operation order", () => {
    it("keys source colors before resampling and runs emboss after tone", () => {
      const color = rgb(0, 255, 0);
      const resize = { width: 10, height: 10, filter: "lanczos3" } as const;
      expect(buildOps(edit({
        colorKey: { color, tolerance: 0 },
        resize,
        exposure: -1,
        emboss: 50,
      }))).toEqual([
        { kind: "colorKey", color, tolerance: 0 },
        { kind: "resize", ...resize },
        { kind: "exposure", stops: -1 },
        { kind: "emboss", amount: 50 },
      ]);
    });

    it("puts rotate and flip before crop", () => {
      // The crop rect is drawn on the rotated preview, so it is only meaningful
      // in post-rotation space. Reversing these silently crops the wrong region.
      const k = kinds(
        edit({
          rotate: 90,
          flipH: true,
          crop: { x: 0, y: 0, width: 0.5, height: 0.5 },
        }),
      );
      expect(k).toEqual(["rotate", "flip", "crop"]);
    });

    it("puts resize before blur, so radii are in output pixels", () => {
      const k = kinds(
        edit({ resize: { width: 10, height: 10, filter: "lanczos3" }, blur: 2 }),
      );
      expect(k.indexOf("resize")).toBeLessThan(k.indexOf("blur"));
    });

    it("puts border before roundCorners, so corners round through the border", () => {
      const k = kinds(edit({ border: { width: 4, color: rgb(0, 0, 0) }, round: 8 }));
      expect(k).toEqual(["border", "roundCorners"]);
    });

    it("puts dropShadow last, so it reads the finished alpha silhouette", () => {
      const k = kinds(
        edit({
          round: 8,
          border: { width: 2, color: rgb(0, 0, 0) },
          blur: 1,
          shadow: { ...INITIAL_EDIT.shadow, opacity: 60 },
        }),
      );
      expect(k[k.length - 1]).toBe("dropShadow");
    });

    it("puts autoContrast before the manual tone controls it would otherwise fight", () => {
      const k = kinds(edit({ autoContrast: true, gamma: 1.5, brightness: 10 }));
      expect(k).toEqual(["autoContrast", "gamma", "adjust"]);
    });

    it("keeps a full pipeline in the documented order", () => {
      const k = kinds(
        edit({
          rotate: 90,
          flipV: true,
          crop: { x: 0, y: 0, width: 1, height: 0.5 },
          resize: { width: 100, height: 100, filter: "triangle" },
          pad: { width: 120, height: 120, color: rgb(0, 0, 0), anchor: "center" },
          autoContrast: true,
          gamma: 1.2,
          brightness: 5,
          grayscale: true,
          blur: 1,
          opacity: 50,
          border: { width: 3, color: rgb(255, 255, 255) },
          round: 6,
          shadow: { ...INITIAL_EDIT.shadow, opacity: 40 },
        }),
      );
      expect(k).toEqual([
        "rotate", "flip", "crop", "resize", "pad",
        "autoContrast", "gamma", "adjust", "grayscale",
        "blur",
        "opacity", "border", "roundCorners", "dropShadow",
      ]);
    });
  });
});
