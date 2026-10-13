import { expect, test } from "vitest";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { editShapeBasicAppearance } from "../../../modules/sheet-drawings/shape-basic-appearance-edit";
import type { ShapeDetailedStyle } from "@sheetcraft/core/shape-style";
const line = {
  paint: { kind: "solid" as const, color: { kind: "rgb" as const, rgb: "#aabbcc" }, opacity: 0.6 },
  widthPt: 5,
  compound: "double" as const,
  dash: "dash" as const,
  cap: "round" as const,
  join: "round" as const,
  miterLimit: 4,
};
test("basic stroke edit retains actual detailed width/compound/dash even when stale base width is zero", () => {
  const drawing = {
    ...createGraphicDrawing("s", "shape", "shape", { row: 0, column: 0 }),
    strokeWidth: 0,
    shapeStyle: { line: { kind: "value" as const, value: line }, glow: { kind: "none" as const } },
  };
  const before = structuredClone(drawing);
  expect(editShapeBasicAppearance(drawing, "stroke", "#112233").shapeStyle?.line).toEqual({
    kind: "value",
    value: {
      ...line,
      paint: { kind: "solid", color: { kind: "rgb", rgb: "#112233" }, opacity: 1 },
    },
  });
  expect(drawing).toEqual(before);
});
test("basic width edit retains detailed paint even when stale basic stroke is transparent", () => {
  const drawing = {
    ...createGraphicDrawing("s", "shape", "shape", { row: 0, column: 0 }),
    stroke: "transparent",
    shapeStyle: { line: { kind: "value" as const, value: line } },
  };
  expect(editShapeBasicAppearance(drawing, "strokeWidth", 8).shapeStyle?.line).toEqual({
    kind: "value",
    value: { ...line, widthPt: 6 },
  });
  expect(editShapeBasicAppearance(drawing, "strokeWidth", 0).shapeStyle?.line).toEqual({
    kind: "none",
  });
});
test("basic fill replaces only selected paint; old simple shapes keep no detailed-style feature", () => {
  const drawing = createGraphicDrawing("s", "shape", "shape", { row: 0, column: 0 });
  expect(editShapeBasicAppearance(drawing, "fill", "#112233").shapeStyle).toBeUndefined();
  const style: ShapeDetailedStyle = {
    fill: { kind: "none" },
    line: { kind: "value", value: line },
  };
  const next = editShapeBasicAppearance({ ...drawing, shapeStyle: style }, "fill", "#112233");
  expect(next.shapeStyle?.fill).toEqual({
    kind: "value",
    value: { kind: "solid", color: { kind: "rgb", rgb: "#112233" }, opacity: 1 },
  });
  expect(next.shapeStyle?.line).toEqual(style.line);
  expect(editShapeBasicAppearance(next, "fill", "transparent").shapeStyle?.fill).toEqual({
    kind: "none",
  });
});
test("typed TextBox basic controls replace visible body overrides while legacy reads remain plain", () => {
  const plain = createGraphicDrawing("t", "textBox", "TextBox", { row: 0, column: 0 });
  delete plain.shapeText;
  expect(editShapeBasicAppearance(plain, "fill", "#123456").shapeText).toBeUndefined();
  expect(editShapeBasicAppearance(plain, "fill", "#123456").shapeStyle).toBeUndefined();
  const detailed = { ...plain, shapeStyle: { line: { kind: "value" as const, value: line } } };
  const fill = editShapeBasicAppearance(detailed, "fill", "#123456");
  expect(fill.kind).toBe("textBox");
  expect(fill.shapeText).toBeDefined();
  expect(fill.shapeStyle?.fill).toMatchObject({ value: { color: { rgb: "#123456" } } });
  expect(editShapeBasicAppearance(fill, "stroke", "#654321").shapeStyle?.line).toMatchObject({
    value: { widthPt: 5, paint: { color: { rgb: "#654321" } } },
  });
  expect(editShapeBasicAppearance(fill, "strokeWidth", 8).shapeStyle?.line).toMatchObject({
    value: { widthPt: 6 },
  });
  expect(editShapeBasicAppearance(fill, "strokeWidth", 0).shapeStyle?.line).toEqual({
    kind: "none",
  });
  expect(detailed.shapeText).toBeUndefined();
});
