// @vitest-environment node
import { expect, test } from "vitest";
import { SHAPE_PRESET_FILLED_NAMES } from "@sheetcraft/core/shape-presets";
import {
  PICTURE_CROP_SHAPE_GALLERY,
  PICTURE_CROP_SHAPE_MENU_LABELS,
  pictureCropShapeChoiceValue,
  pictureCropShapePreview,
} from "../../../../modules/sheet-images/picture-crop-shape-catalog";

const choices = PICTURE_CROP_SHAPE_GALLERY.flatMap((group) => group.items);

test("desktop crop categories contain exactly 147 distinct filled preset choices", () => {
  expect(PICTURE_CROP_SHAPE_GALLERY.map((group) => [group.id, group.items.length])).toEqual([
    ["rectangles", 9],
    ["basic", 41],
    ["arrows", 27],
    ["equation", 6],
    ["flowchart", 28],
    ["stars", 20],
    ["callouts", 16],
  ]);
  expect(choices).toHaveLength(147);
  expect(new Set(choices.map((item) => item.preset)).size).toBe(147);
  const filled = new Set<string>(SHAPE_PRESET_FILLED_NAMES);
  expect(choices.filter((item) => !filled.has(item.preset))).toEqual([]);
  expect(
    choices.some((item) =>
      /^(?:line|straightConnector|bentConnector|curvedConnector|textBox)/u.test(item.preset),
    ),
  ).toBe(false);
  expect(PICTURE_CROP_SHAPE_GALLERY[1]!.items[0]!.preset).toBe("ellipse");
});

test("the complete arrow order follows the desktop gallery, including its curved directions", () => {
  expect(
    PICTURE_CROP_SHAPE_GALLERY.find((group) => group.id === "arrows")!.items.map(
      (item) => item.preset,
    ),
  ).toEqual([
    "rightArrow",
    "leftArrow",
    "upArrow",
    "downArrow",
    "leftRightArrow",
    "upDownArrow",
    "quadArrow",
    "leftRightUpArrow",
    "bentArrow",
    "uturnArrow",
    "leftUpArrow",
    "bentUpArrow",
    "curvedRightArrow",
    "curvedLeftArrow",
    "curvedUpArrow",
    "curvedDownArrow",
    "stripedRightArrow",
    "notchedRightArrow",
    "homePlate",
    "chevron",
    "rightArrowCallout",
    "leftArrowCallout",
    "upArrowCallout",
    "downArrowCallout",
    "leftRightArrowCallout",
    "quadArrowCallout",
    "circularArrow",
  ]);
  const pentagon = choices.find((item) => item.preset === "homePlate")!;
  expect(pentagon.label).toEqual({ "en-US": "Pentagon", "zh-CN": "五边形" });
});

test("ribbon directions and border/accent callout semantics are explicit", () => {
  expect(
    PICTURE_CROP_SHAPE_GALLERY.find((group) => group.id === "stars")!
      .items.slice(12, 16)
      .map((item) => item.preset),
  ).toEqual(["ribbon2", "ribbon", "ellipseRibbon2", "ellipseRibbon"]);
  expect(
    PICTURE_CROP_SHAPE_GALLERY.find((group) => group.id === "callouts")!
      .items.slice(4)
      .map((item) => item.preset),
  ).toEqual([
    "borderCallout1",
    "borderCallout2",
    "borderCallout3",
    "accentCallout1",
    "accentCallout2",
    "accentCallout3",
    "callout1",
    "callout2",
    "callout3",
    "accentBorderCallout1",
    "accentBorderCallout2",
    "accentBorderCallout3",
  ]);
});

test("every category, choice and menu message has its own English and Chinese labels", () => {
  for (const item of [...PICTURE_CROP_SHAPE_GALLERY, ...choices]) {
    expect(item.label["en-US"]).toMatch(/[A-Za-z]/u);
    expect(item.label["zh-CN"]).toMatch(/[\u4e00-\u9fff]/u);
  }
  expect(PICTURE_CROP_SHAPE_MENU_LABELS["en-US"].trigger).toBe("Crop to Shape");
  expect(PICTURE_CROP_SHAPE_MENU_LABELS["zh-CN"].trigger).toBe("裁剪为形状");
});

test("rectangle clears the crop mask and other gallery selections return fresh preset values", () => {
  expect(pictureCropShapeChoiceValue("rect")).toBeUndefined();
  const first = pictureCropShapeChoiceValue("ellipse");
  expect(first).toEqual({ preset: "ellipse" });
  expect(pictureCropShapeChoiceValue("ellipse")).not.toBe(first);
  expect(() => pictureCropShapeChoiceValue("line")).toThrow("gallery choice");
  expect(() => pictureCropShapeChoiceValue("gear6")).toThrow("gallery choice");
});

test("all previews use finite numeric SVG paths and retain callout tails in their view box", () => {
  for (const item of choices) {
    const preview = pictureCropShapePreview(item.preset);
    expect(preview).toBe(pictureCropShapePreview(item.preset));
    const box = preview.viewBox.split(" ").map(Number);
    expect(box).toHaveLength(4);
    expect(box.every(Number.isFinite)).toBe(true);
    expect(box[2]!).toBeGreaterThan(0);
    expect(box[3]!).toBeGreaterThan(0);
    expect(preview.paths.length).toBeGreaterThan(0);
    expect(preview.paths.length).toBeLessThanOrEqual(16);
    expect(preview.paths.some((path) => path.filled)).toBe(true);
    for (const path of preview.paths) {
      expect(path.d).toMatch(/^M/u);
      expect(path.d).not.toMatch(/NaN|Infinity|undefined|[<>"&]|https?:/u);
    }
  }
  const callout = pictureCropShapePreview("borderCallout1").viewBox.split(" ").map(Number);
  expect(callout[0]!).toBeLessThan(-1.5);
  expect(callout[3]!).toBeGreaterThan(27);
});
