import { expect, test } from "vitest";
import {
  editPictureDetailedCategory,
  getPictureOwnDetailedStyle,
  PICTURE_DETAILED_CATEGORIES,
} from "../../../../modules/sheet-images/picture-detailed-style-edit";
import { resetPictureAppearance } from "../../../../modules/sheet-images/picture-appearance-edit";
import type { ImageAppearance } from "@sheetcraft/core/workbook";

test.each(PICTURE_DETAILED_CATEGORIES)(
  "explicit none %s is durable and changes no unrelated pixels or metadata",
  (category) => {
    const appearance: ImageAppearance = {
      opacity: 0.6,
      brightness: 1.2,
      transparentColor: "#FF00FF",
      detailedStyle: { fill: { kind: "none" }, glow: { kind: "none" } },
    };
    const before = structuredClone(appearance),
      result = editPictureDetailedCategory(appearance, { category, value: { kind: "none" } });
    expect(result?.detailedStyle?.[category]).toEqual({ kind: "none" });
    expect(result).toMatchObject({ opacity: 0.6, brightness: 1.2, transparentColor: "#FF00FF" });
    expect(appearance).toEqual(before);
  },
);
test("inherit removes the last typed category without forcing protocol 50", () => {
  expect(
    editPictureDetailedCategory(
      { opacity: 0.6, detailedStyle: { fill: { kind: "none" } } },
      { category: "fill", value: undefined },
    ),
  ).toEqual({ opacity: 0.6 });
});
test.each(["line", "shadow", "reflection"] as const)(
  "explicit inherit clears the same-category legacy decoration and suppress flag only: %s",
  (category) => {
    const appearance: ImageAppearance = {
      ...resetPictureAppearance(),
      border: { color: "#112233", width: 2 },
      shadow: "soft",
      reflection: true,
    };
    const result = editPictureDetailedCategory(appearance, { category, value: undefined })!;
    if (category === "line") {
      expect(result.border).toBeUndefined();
      expect(result.suppressThemeEffects?.outline).toBeUndefined();
      expect(result.shadow).toBe("soft");
    }
    if (category === "shadow") {
      expect(result.shadow).toBeUndefined();
      expect(result.suppressThemeEffects?.shadow).toBeUndefined();
      expect(result.border).toEqual(appearance.border);
    }
    if (category === "reflection") {
      expect(result.reflection).toBeUndefined();
      expect(result.suppressThemeEffects?.reflection).toBeUndefined();
      expect(result.border).toEqual(appearance.border);
    }
    expect(result.suppressThemeEffects?.bevel).toBe(true);
  },
);
test("legacy local line/shadow/reflection are exposed as genuine editable choices without creating fill", () => {
  const appearance: ImageAppearance = {
    border: { color: "#112233", width: 2 },
    shadow: "hard",
    reflection: true,
  };
  const before = structuredClone(appearance),
    result = getPictureOwnDetailedStyle(appearance)!;
  expect(result.line).toMatchObject({ kind: "value", value: { widthPt: 1.5 } });
  expect(result.shadow).toMatchObject({ kind: "value", value: { kind: "outer" } });
  expect(result.reflection).toMatchObject({ kind: "value", value: { size: 0.25 } });
  expect(result.fill).toBeUndefined();
  expect(appearance).toEqual(before);
});
test("typed local line suppresses theme outline and does not retain a competing legacy line", () => {
  const line = getPictureOwnDetailedStyle({ border: { color: "#112233", width: 2 } })!.line;
  const result = editPictureDetailedCategory(
    { border: { color: "#445566", width: 4 } },
    { category: "line", value: line },
  );
  expect(result?.border).toBeUndefined();
  expect(result?.suppressThemeEffects?.outline).toBe(true);
  expect(result?.detailedStyle?.line).toEqual(line);
});
test("malformed structured paint is rejected rather than silently resetting an existing category", () => {
  const before: ImageAppearance = { detailedStyle: { fill: { kind: "none" } } };
  expect(() =>
    editPictureDetailedCategory(before, {
      category: "fill",
      value: {
        kind: "value",
        value: { kind: "solid", color: { kind: "automatic" }, opacity: Infinity },
      },
    }),
  ).toThrow();
  expect(before.detailedStyle?.fill).toEqual({ kind: "none" });
});

test("explicit reset suppression displays none rather than falsely displaying inherit", () => {
  const own = getPictureOwnDetailedStyle(resetPictureAppearance())!;
  expect(own.line).toEqual({ kind: "none" });
  expect(own.shadow).toEqual({ kind: "none" });
  expect(own.reflection).toEqual({ kind: "none" });
  expect(own.format3d).toEqual({ kind: "none" });
  expect(own.fill).toBeUndefined();
});
