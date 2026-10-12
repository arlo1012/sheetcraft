// @vitest-environment node
import { expect, test } from "vitest";
import { normalizeDetailedPictureStyle } from "@sheetcraft/core/picture-detailed-style";
import { DEFAULT_WORKBOOK_THEME } from "@sheetcraft/core/workbook-theme";
import {
  getPictureEffectPresetGroups,
  getPictureEffectPreset,
  findPictureEffectPresetId,
  type PicturePresetCategory,
} from "../../../../modules/sheet-images/picture-effect-presets";
import { planDetailedPictureRaster } from "../../../../shared/images/picture-detailed-compositor";
import { getPictureRasterProjection } from "../../../../shared/images/picture-detailed-render";
import {
  PICTURE_MATERIAL_GALLERY,
  PICTURE_LIGHTING_GALLERY,
} from "../../../../modules/sheet-images/picture-material-presets";
const cases: readonly (readonly [PicturePresetCategory, readonly number[]])[] = [
  ["shadow", [1, 9, 9, 5]],
  ["reflection", [1, 9]],
  ["glow", [1, 24]],
  ["softEdges", [1, 6]],
  ["rotation3d", [1, 10, 11, 4]],
];
test.each(cases)(
  "%s catalog has distinct named choices and true bounded paint plans",
  (category, counts) => {
    const groups = getPictureEffectPresetGroups(category);
    expect(groups.map((group) => group.items.length)).toEqual(counts);
    const items = groups.flatMap((group) => group.items);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    for (const item of items) {
      const style = normalizeDetailedPictureStyle(item.previewStyle)!;
      expect(style).toEqual(item.previewStyle);
      expect(getPictureEffectPreset(category, item.id)).toEqual(item.value);
      expect(findPictureEffectPresetId(category, item.value as never)).toBe(item.id);
      const plan = planDetailedPictureRaster({
        widthPx: 360,
        heightPx: 240,
        pixelDensity: 1,
        style,
        ...getPictureRasterProjection(style, DEFAULT_WORKBOOK_THEME),
      });
      expect(plan.kind).toBe("ready");
      expect(plan.widthRaster).toBeLessThanOrEqual(4096);
      expect(plan.heightRaster).toBeLessThanOrEqual(4096);
      expect(plan.estimatedPeakBytes).toBeLessThanOrEqual(256 * 1024 * 1024);
    }
  },
);
test("glow retains six live accents at each of four real sizes", () => {
  const items = getPictureEffectPresetGroups("glow")[1]!.items;
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 6; column++) {
      expect(items[row * 6 + column]!.value).toMatchObject({
        kind: "value",
        value: {
          color: { kind: "theme", reference: { slot: `accent${column + 1}` } },
          sizePt: [2, 5, 10, 15][row],
        },
      });
    }
  }
});
test("a selected preset is detached, unknown IDs do not silently become inherit", () => {
  const first = getPictureEffectPreset("shadow", "outer-top-left")!;
  if (first.kind !== "value") throw Error("Missing shadow.");
  first.value.blurPt = 123;
  expect(getPictureEffectPreset("shadow", "outer-top-left")).toMatchObject({
    kind: "value",
    value: { blurPt: 4 },
  });
  expect(getPictureEffectPreset("shadow", "not-a-preset")).toBeUndefined();
  expect(findPictureEffectPresetId("shadow", undefined)).toBeUndefined();
  expect(findPictureEffectPresetId("shadow", first)).toBeUndefined();
});
test("material and lighting categories preserve the complete catalog layout", () => {
  expect(PICTURE_MATERIAL_GALLERY.map((g) => g.items.length)).toEqual([4, 4, 3]);
  expect(PICTURE_LIGHTING_GALLERY.map((g) => g.items.length)).toEqual([6, 3, 2, 4]);
});

test("all eleven materials and fifteen lighting previews are canonical and independently paintable", () => {
  for (const [groups, count] of [
    [PICTURE_MATERIAL_GALLERY, 11],
    [PICTURE_LIGHTING_GALLERY, 15],
  ] as const) {
    const items = groups.flatMap((group) => group.items);
    expect(items).toHaveLength(count);
    expect(new Set(items.map((item) => item.id)).size).toBe(count);
    for (const item of items) {
      expect(normalizeDetailedPictureStyle(item.previewStyle)).toEqual(item.previewStyle);
      expect(
        planDetailedPictureRaster({
          widthPx: 32,
          heightPx: 24,
          pixelDensity: 2,
          style: item.previewStyle,
          ...getPictureRasterProjection(item.previewStyle, DEFAULT_WORKBOOK_THEME),
          limits: { side: 512, pixels: 262144, memoryBytes: 16 * 1024 * 1024 },
        }).kind,
      ).toBe("ready");
    }
  }
});
