import { describe, expect, test, vi } from "vitest";
import {
  normalizeImageAppearance,
  type ImageAppearance,
  type ImageThemeEffectSuppression,
} from "../../image-appearance.js";
import { areImageTransformsEqual, cloneImageTransform } from "../../image-transform.js";
import { clonePictureRootsForClipboard } from "../../picture-group-copy.js";
import { normalizePictureObjectCollection } from "../../picture-object.js";
import { cloneCellContent, cloneFloatingImage } from "../../workbook.js";
import { childNodes, fixture } from "../picture-group-edit/fixture.js";
import { picture } from "../picture-group-planning/fixture.js";
import type { PictureGroup } from "../../picture-group.js";

describe("explicit inherited picture effect suppression", () => {
  test("absence and empty suppression retain existing default normalization", () => {
    expect(normalizeImageAppearance({ suppressThemeEffects: {} })).toBeUndefined();
    expect(
      normalizeImageAppearance({
        reflection: false,
        opacity: 1,
        border: { color: "#abcdef", width: 0 },
        suppressThemeEffects: {},
      }),
    ).toBeUndefined();
    expect(normalizeImageAppearance({ shadow: "soft", reflection: true })).toEqual({
      shadow: "soft",
      reflection: true,
    });
    // Existing unrelated fields continue through their established normalization.
    expect(
      normalizeImageAppearance({ brightness: 1.5, unrelated: true } as ImageAppearance),
    ).toEqual({ brightness: 1.5 });
  });

  test.each(["shadow", "outline", "reflection", "bevel"] as const)(
    "retains only the explicitly supplied %s flag in a fresh sparse record",
    (key) => {
      const flags: ImageThemeEffectSuppression = { [key]: true };
      const normalized = normalizeImageAppearance({ suppressThemeEffects: flags })!;
      expect(normalized).toEqual({ suppressThemeEffects: { [key]: true } });
      expect(normalized.suppressThemeEffects).not.toBe(flags);
      delete normalized.suppressThemeEffects![key];
      expect(flags[key]).toBe(true);
    },
  );

  test("canonicalizes flag order and accepts own data on null-prototype records", () => {
    const flags = Object.create(null) as ImageThemeEffectSuppression;
    flags.bevel = true;
    flags.shadow = true;
    Object.defineProperty(flags, "reflection", { value: true });
    const normalized = normalizeImageAppearance({ suppressThemeEffects: flags })!;
    expect(Object.keys(normalized.suppressThemeEffects!)).toEqual([
      "shadow",
      "reflection",
      "bevel",
    ]);
    expect(
      areImageTransformsEqual(
        { appearance: { suppressThemeEffects: flags } },
        { appearance: { suppressThemeEffects: { reflection: true, shadow: true, bevel: true } } },
      ),
    ).toBe(true);
    expect(
      areImageTransformsEqual(
        { appearance: { suppressThemeEffects: { shadow: true } } },
        { appearance: {} },
      ),
    ).toBe(false);
    expect(areImageTransformsEqual({ appearance: { suppressThemeEffects: {} } }, undefined)).toBe(
      true,
    );
  });

  test.each([
    null,
    [],
    1,
    "all",
    { shadow: false },
    { shadow: undefined },
    { outline: 1 },
    { reflection: "true" },
    { bevel: null },
    { shadow: {} },
    { glow: true },
    { [Symbol("shadow")]: true },
    Object.create({ shadow: true }),
    new Date(0),
  ])("rejects malformed suppression %j", (flags) => {
    expect(() =>
      normalizeImageAppearance({ suppressThemeEffects: flags } as unknown as ImageAppearance),
    ).toThrow();
  });

  test("rejects inherited suppression and both levels of accessors without invoking them", () => {
    const getter = vi.fn(() => true);
    const flags = {};
    Object.defineProperty(flags, "shadow", { get: getter });
    expect(() =>
      normalizeImageAppearance({ suppressThemeEffects: flags } as ImageAppearance),
    ).toThrow(/data/);
    const appearance = {};
    Object.defineProperty(appearance, "suppressThemeEffects", { get: getter });
    expect(() => normalizeImageAppearance(appearance as ImageAppearance)).toThrow(/data/);
    const inherited = Object.create({ suppressThemeEffects: { shadow: true } });
    expect(() => normalizeImageAppearance(inherited)).toThrow(/own data/);
    expect(getter).not.toHaveBeenCalled();
  });

  test("transform, cell and floating clones detach flags independently", () => {
    const appearance: ImageAppearance = {
      border: { color: "#ABCDEF", width: 2 },
      suppressThemeEffects: { shadow: true, outline: true },
    };
    const transform = { appearance };
    const transformed = cloneImageTransform(transform)!;
    const content = { kind: "image" as const, image: { assetId: "asset", altText: "", transform } };
    const clonedCell = cloneCellContent(content);
    if (clonedCell.kind !== "image") throw Error("Expected a cell image");
    const source = { ...picture("floating", 0), transform };
    const clonedFloating = cloneFloatingImage(source);
    const flags = [
      transformed.appearance!.suppressThemeEffects!,
      clonedCell.image.transform!.appearance!.suppressThemeEffects!,
      clonedFloating.transform!.appearance!.suppressThemeEffects!,
    ];
    expect(new Set(flags).size).toBe(3);
    for (const flag of flags) {
      expect(flag).not.toBe(appearance.suppressThemeEffects);
      delete flag.shadow;
    }
    expect(appearance.suppressThemeEffects).toEqual({ shadow: true, outline: true });
  });

  test("owned normalization and clipboard copies detach reused flag records at every leaf", () => {
    const f = fixture();
    const flags: ImageThemeEffectSuppression = { reflection: true, bevel: true };
    f.picture.transform!.appearance!.suppressThemeEffects = flags;
    const sibling = f.inner.members[1]!;
    if (sibling.kind !== "grouped-picture-v1") throw Error("Expected a leaf");
    sibling.transform = { appearance: { suppressThemeEffects: flags } };
    const normalized = normalizePictureObjectCollection([f.root])[0] as PictureGroup;
    const cloned = cloneFloatingImage(f.root);
    let count = 0;
    const copied = clonePictureRootsForClipboard([f.root], {
      createId: () => `copy-${++count}`,
    })[0] as PictureGroup;
    const detached = [normalized, cloned, copied].flatMap((root) => {
      const { inner, picture: leaf } = childNodes(root);
      const other = inner.members[1]!;
      if (other.kind !== "grouped-picture-v1") throw Error("Expected a leaf");
      return [
        leaf.transform!.appearance!.suppressThemeEffects!,
        other.transform!.appearance!.suppressThemeEffects!,
      ];
    });
    expect(new Set(detached).size).toBe(6);
    for (const flag of detached) {
      expect(flag).not.toBe(flags);
      delete flag.reflection;
    }
    expect(flags).toEqual({ reflection: true, bevel: true });
  });
});
