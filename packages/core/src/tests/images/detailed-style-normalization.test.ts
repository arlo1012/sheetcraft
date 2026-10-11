import { describe, expect, test, vi } from "vitest";
import { normalizeImageAppearance, type ImageAppearance } from "../../image-appearance.js";
import {
  normalizeDetailedPictureStyle,
  cloneDetailedPictureStyle,
  getDetailedPictureStyleAssetIds,
  PICTURE_DETAILED_STYLE_LIMITS,
  PICTURE_MATERIAL_IDS,
  PICTURE_LIGHTING_IDS,
  PICTURE_PATTERN_PRESETS,
  type PictureDetailedStyle,
  type PictureLine,
  type PicturePaint,
} from "../../picture-detailed-style.js";
import { fullStyle, gradient, line, picturePaint, rgb } from "./detailed-style-fixture.js";

function fill(value: unknown) {
  return normalizeDetailedPictureStyle({ fill: { kind: "value", value } });
}
describe("complete typed picture appearance normalization", () => {
  test("empty records disappear, explicit None persists, and legacy styles coexist losslessly", () => {
    expect(normalizeDetailedPictureStyle(undefined)).toBeUndefined();
    expect(normalizeDetailedPictureStyle({})).toBeUndefined();
    expect(normalizeImageAppearance({ detailedStyle: {} })).toBeUndefined();
    const legacy: ImageAppearance = {
      shadow: "hard",
      reflection: true,
      border: { color: "#ABCDEF", width: 2 },
      suppressThemeEffects: { outline: true },
    };
    expect(normalizeImageAppearance(legacy)).toEqual(legacy);
    for (const category of [
      "fill",
      "line",
      "shadow",
      "reflection",
      "glow",
      "softEdges",
      "format3d",
      "rotation3d",
    ] as const) {
      const style = { [category]: { kind: "none" } };
      expect(normalizeDetailedPictureStyle(style)).toEqual(style);
      expect(normalizeImageAppearance({ ...legacy, detailedStyle: style })).toEqual({
        ...legacy,
        detailedStyle: style,
      });
    }
    expect(normalizeDetailedPictureStyle(fullStyle())).toEqual(fullStyle());
  });

  test("canonical order, RGB/theme colors and degrees make equal tuples deterministic", () => {
    const source = fullStyle();
    const reordered = Object.fromEntries(Object.entries(source).reverse());
    expect(JSON.stringify(normalizeDetailedPictureStyle(reordered))).toBe(
      JSON.stringify(normalizeDetailedPictureStyle(source)),
    );
    const normalized = fill({ kind: "solid", color: { kind: "rgb", rgb: "#abcdef" }, opacity: 0 });
    expect(normalized?.fill).toEqual({
      kind: "value",
      value: { kind: "solid", color: rgb(), opacity: 0 },
    });
    expect(fill({ ...gradient(), angleDeg: -330 })).toEqual(fill(gradient()));
    expect(
      fill({
        kind: "solid",
        color: { kind: "theme", reference: { slot: "accent1", tint: 0 } },
        opacity: 1,
      })?.fill,
    ).toEqual({
      kind: "value",
      value: {
        kind: "solid",
        color: { kind: "theme", reference: { slot: "accent1" } },
        opacity: 1,
      },
    });
    const ordinary = Object.assign(Object.create(null), source);
    expect(normalizeDetailedPictureStyle(ordinary)).toEqual(source);
  });

  test("all branch-specific gradient, image-fill and pattern geometries remain representable", () => {
    const linear = gradient();
    const { angleDeg: _angle, kind: _kind, ...base } = linear;
    for (const kind of ["radial", "rectangular"] as const)
      expect(
        fill({ ...base, kind, centerX: 0.3, centerY: 0.4, radiusX: 1, radiusY: 0.7 })?.fill,
      ).toBeDefined();
    for (const preset of PICTURE_PATTERN_PRESETS) {
      const paint: PicturePaint = {
        kind: "pattern",
        preset,
        foreground: rgb(),
        background: {
          kind: "automatic",
        },
        opacity: 0.8,
        rotateWithShape: false,
      };
      expect(fill(paint)?.fill).toEqual({ kind: "value", value: paint });
    }
    const tiled = picturePaint();
    expect(fill(tiled)?.fill).toEqual({ kind: "value", value: tiled });
    const stretched = {
      ...tiled,
      layout: { kind: "stretch", offsetXRatio: 0, offsetYRatio: 0, widthRatio: 1, heightRatio: 1 },
    };
    expect(fill(stretched)?.fill).toEqual({ kind: "value", value: stretched });
    const style = {
      fill: { kind: "value" as const, value: picturePaint("a") },
      line: { kind: "value" as const, value: line(picturePaint("b")) },
    };
    expect(getDetailedPictureStyleAssetIds(style)).toEqual(["a", "b"]);
    style.line.value.paint = picturePaint("a");
    expect(getDetailedPictureStyleAssetIds(style)).toEqual(["a"]);
    expect(getDetailedPictureStyleAssetIds(fullStyle())).toEqual([]);
    expect(getDetailedPictureStyleAssetIds(undefined)).toEqual([]);
  });

  test("all complete line enums and material/lighting catalogue IDs are accepted", () => {
    const sample = line();
    const enums: { [Key in "compound" | "dash" | "cap" | "join"]: readonly PictureLine[Key][] } = {
      compound: ["single", "double", "thick-thin", "thin-thick", "triple"],
      dash: [
        "solid",
        "round-dot",
        "square-dot",
        "dash",
        "short-dash",
        "long-dash",
        "long-dash-dot",
        "long-dash-dot-dot",
      ],
      cap: ["butt", "round", "square"],
      join: ["round", "bevel", "miter"],
    };
    for (const key of ["compound", "dash", "cap", "join"] as const)
      for (const entry of enums[key])
        expect(
          normalizeDetailedPictureStyle({
            line: {
              kind: "value",
              value: { ...sample, [key]: entry },
            },
          }),
        ).toBeDefined();
    const formatting = fullStyle().format3d!;
    if (formatting.kind !== "value") throw Error("Expected formatting");
    for (const material of PICTURE_MATERIAL_IDS)
      for (const lighting of PICTURE_LIGHTING_IDS)
        expect(
          normalizeDetailedPictureStyle({
            format3d: {
              kind: "value",
              value: {
                ...formatting.value,
                material,
                lighting,
              },
            },
          }),
        ).toBeDefined();
    expect(PICTURE_PATTERN_PRESETS).toHaveLength(54);
    expect(PICTURE_MATERIAL_IDS).toHaveLength(11);
    expect(PICTURE_LIGHTING_IDS).toHaveLength(15);
  });

  test("inner/outer shadows and parallel/oblique projections have closed exclusive branches", () => {
    const style = fullStyle();
    const shadow = style.shadow!;
    if (shadow.kind !== "value" || shadow.value.kind !== "perspective")
      throw Error("Expected shadow");
    const {
      scaleX: _sx,
      scaleY: _sy,
      skewXDeg: _skew,
      originX: _ox,
      originY: _oy,
      ...base
    } = shadow.value;
    for (const kind of ["outer", "inner"] as const) {
      expect(
        normalizeDetailedPictureStyle({ shadow: { kind: "value", value: { ...base, kind } } }),
      ).toBeDefined();
      expect(() =>
        normalizeDetailedPictureStyle({
          shadow: {
            kind: "value",
            value: {
              ...base,
              kind,
              scaleX: 1,
            },
          },
        }),
      ).toThrow(/conflicting/);
    }
    const axes = { xDeg: 45, yDeg: 0, zDeg: 0, distanceFromGroundPt: 0 };
    for (const value of [
      { ...axes, projection: "parallel" },
      { ...axes, projection: "oblique", shearX: -0.5, shearY: 0.5 },
    ]) {
      expect(normalizeDetailedPictureStyle({ rotation3d: { kind: "value", value } })).toBeDefined();
      expect(() =>
        normalizeDetailedPictureStyle({
          rotation3d: {
            kind: "value",
            value: {
              ...value,
              perspectiveDeg: 0,
            },
          },
        }),
      ).toThrow(/conflicting/);
    }
    expect(() => fill({ ...gradient(), centerX: 0.5 })).toThrow(/conflicting/);
    expect(() =>
      fill({
        kind: "radial",
        opacity: 1,
        rotateWithShape: false,
        stops: gradient().stops,
        centerX: 0.5,
        centerY: 0.5,
        radiusX: 1,
        radiusY: 1,
        angleDeg: 0,
      }),
    ).toThrow(/conflicting/);
  });

  test("ordered own-data stop arrays preserve hard stops and reject excessive or malformed arrays", () => {
    expect(fill(gradient())).toBeDefined();
    const stop = gradient().stops[0]!;
    expect(
      fill({ ...gradient(), stops: Array.from({ length: 16 }, () => ({ ...stop })) }),
    ).toBeDefined();
    const sparseStops: unknown[] = [];
    sparseStops.length = 2;
    for (const stops of [
      [],
      [stop],
      Array.from({ length: 17 }, () => stop),
      [
        { ...stop, offset: 1 },
        { ...stop, offset: 0 },
      ],
      sparseStops,
      Object.assign([stop, stop], { extra: 1 }),
      Object.assign([stop, stop], { [Symbol("extra")]: true }),
    ])
      expect(() => fill({ ...gradient(), stops })).toThrow();
    const getter = vi.fn(() => stop);
    const accessor = [stop, stop];
    Object.defineProperty(accessor, "0", { get: getter });
    expect(() => fill({ ...gradient(), stops: accessor })).toThrow(/data/);
    const subclass = [stop, stop];
    Object.setPrototypeOf(subclass, Object.create(Array.prototype));
    expect(() => fill({ ...gradient(), stops: subclass })).toThrow(/ordinary/);
    expect(getter).not.toHaveBeenCalled();
  });

  test("nested descriptors, own fields, prototypes, symbols and unknown keys fail without executing getters", () => {
    const getter = vi.fn(() => 0.5);
    for (const mutate of [
      (style: PictureDetailedStyle) => Object.defineProperty(style, "fill", { get: getter }),
      (style: PictureDetailedStyle) => Object.defineProperty(style.fill!, "value", { get: getter }),
      (style: PictureDetailedStyle) => {
        if (style.fill?.kind === "value")
          Object.defineProperty(style.fill.value, "opacity", { get: getter });
      },
      (style: PictureDetailedStyle) => {
        if (style.fill?.kind === "value" && style.fill.value.kind === "linear")
          Object.defineProperty(style.fill.value.stops[0]!, "brightness", { get: getter });
      },
      (style: PictureDetailedStyle) => {
        if (style.glow?.kind === "value" && style.glow.value.color.kind === "theme")
          Object.defineProperty(style.glow.value.color.reference, "slot", { get: getter });
      },
    ]) {
      const style = fullStyle();
      mutate(style);
      expect(() => normalizeDetailedPictureStyle(style)).toThrow(/data/);
    }
    for (const value of [
      null,
      [],
      new Date(0),
      Object.create({ fill: { kind: "none" } }),
      { unknown: true },
      { fill: undefined },
      { [Symbol("fill")]: true },
      { fill: { kind: "none", value: {} } },
      { fill: { kind: "value" } },
      { line: { local: { kind: "none" }, inheritedOutline: "inherit" } },
    ])
      expect(() => normalizeDetailedPictureStyle(value)).toThrow();
    for (const reference of [
      Object.create({ slot: "accent1" }),
      { slot: "accent1", extra: true },
      { slot: "accent1", [Symbol("tint")]: 0 },
      { slot: "invalid" },
      { slot: "accent1", tint: NaN },
    ])
      expect(() =>
        fill({ kind: "solid", color: { kind: "theme", reference }, opacity: 1 }),
      ).toThrow();
    const appearance = {};
    Object.defineProperty(appearance, "detailedStyle", { get: getter });
    expect(() => normalizeImageAppearance(appearance)).toThrow(/data/);
    expect(() => normalizeImageAppearance(Object.create({ detailedStyle: {} }))).toThrow(
      /own data/,
    );
    expect(getter).not.toHaveBeenCalled();
  });

  test("numeric engineering budgets reject nonfinite/out-of-range values and do not clip them", () => {
    for (const opacity of [-0.1, 1.1, NaN, Infinity, "1"])
      expect(() => fill({ kind: "solid", color: rgb(), opacity })).toThrow();
    for (const brightness of [-1.1, 1.1, NaN])
      expect(() =>
        fill({ ...gradient(), stops: gradient().stops.map((stop) => ({ ...stop, brightness })) }),
      ).toThrow();
    for (const sizePt of [-1, PICTURE_DETAILED_STYLE_LIMITS.lengthPt + 1, Infinity])
      expect(() =>
        normalizeDetailedPictureStyle({ softEdges: { kind: "value", value: { sizePt } } }),
      ).toThrow();
    expect(
      normalizeDetailedPictureStyle({ softEdges: { kind: "value", value: { sizePt: 4096 } } }),
    ).toBeDefined();
    for (const assetId of ["", "https://example.com/a.png", "a/b", "bad id", "x".repeat(257)])
      expect(() => fill({ ...picturePaint(), assetId })).toThrow(/asset ID/);
    expect(() =>
      normalizeDetailedPictureStyle({
        line: {
          kind: "value",
          value: {
            ...line(),
            miterLimit: 0,
          },
        },
      }),
    ).toThrow();
    expect(() =>
      normalizeDetailedPictureStyle({
        rotation3d: {
          kind: "value",
          value: {
            projection: "perspective",
            xDeg: 0,
            yDeg: 0,
            zDeg: 0,
            distanceFromGroundPt: 0,
            perspectiveDeg: 121,
          },
        },
      }),
    ).toThrow();
  });

  test("deep cloning detaches stops, theme references, category records and texture layouts", () => {
    const source = fullStyle();
    const cloned = cloneDetailedPictureStyle(source)!;
    expect(cloned).toEqual(source);
    expect(cloned).not.toBe(source);
    if (cloned.fill?.kind !== "value" || cloned.fill.value.kind !== "linear")
      throw Error("Expected fill");
    cloned.fill.value.stops[1]!.opacity = 0;
    const color = cloned.fill.value.stops[1]!.color;
    if (color.kind !== "theme") throw Error("Expected theme color");
    color.reference.tint = -0.5;
    expect(source).toEqual(fullStyle());
    const texture = { fill: { kind: "value" as const, value: picturePaint() } };
    const detached = cloneDetailedPictureStyle(texture)!;
    if (detached.fill?.kind !== "value" || detached.fill.value.kind !== "picture")
      throw Error("Expected texture");
    if (detached.fill.value.layout.kind !== "tile") throw Error("Expected tiled texture");
    detached.fill.value.layout.offsetXPt = 1;
    expect(texture.fill.value).toEqual(picturePaint());
  });
});
