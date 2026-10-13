// @vitest-environment node
import { describe, expect, test } from "vitest";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import type { FloatingImageViewportFragment } from "@sheetcraft/sheet-engine/floating-image-layout";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { getDrawingShapeGeometry } from "../../../modules/sheet-drawings/shape-geometry";
import { shapeTextEditorPlacement } from "../../../modules/sheet-drawings/shape-text-editor-placement";
import { createDefaultShapeText } from "../../../modules/sheet-drawings/shape-text-options";

function drawing(changes: Partial<SheetGraphicDrawing> = {}): SheetGraphicDrawing {
  return {
    ...createGraphicDrawing("editor", "shape", "Editor", { row: 0, column: 0 }),
    width: 80,
    height: 60,
    rotation: 37,
    text: "Saved text",
    ...changes,
  };
}
function fragment(
  rect: FloatingImageViewportFragment["rect"] = { x: 120, y: 90, width: 80, height: 60 },
): FloatingImageViewportFragment {
  return {
    paneId: "body",
    rect,
    clippedRect: { x: 140, y: 110, width: 20, height: 10 },
  };
}

describe("direct shape text editor placement", () => {
  test("active WordArt edits its straight unmirrored source while retaining stored flips and warp", () => {
    const source = drawing({
      shapeGeometry: { preset: "rightArrow" },
      shapeFlipX: true,
      shapeFlipY: true,
      shapeText: { ...createDefaultShapeText(), warp: { preset: "textArchUp" } },
    });
    const before = structuredClone(source),
      rect = getDrawingShapeGeometry(source)!.textRect!;
    const placement = shapeTextEditorPlacement(source, fragment())!;
    expect(placement.input).toEqual({
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.right - rect.left}px`,
      height: `${rect.bottom - rect.top}px`,
    });
    expect(placement.frame.transform).toBe("rotate(37deg)");
    expect(source).toEqual(before);
  });
  test("uses the complete pane fragment and rotates its frame by the real 37-degree angle", () => {
    const source = drawing(),
      viewport = fragment(),
      before = structuredClone({ source, viewport });
    expect(shapeTextEditorPlacement(source, viewport)).toEqual({
      frame: {
        left: "120px",
        top: "90px",
        width: "80px",
        height: "60px",
        transform: "rotate(37deg)",
        transformOrigin: "50% 50%",
      },
      input: { left: "0px", top: "0px", width: "80px", height: "60px" },
    });
    expect({ source, viewport }).toEqual(before);
  });

  test.each(["rightArrow", "upArrow"] as const)(
    "%s uses its real flipped asymmetric text rectangle and a readable inner 180-degree turn",
    (preset) => {
      const source = drawing({
          shapeGeometry: { preset },
          shapeFlipX: true,
          shapeFlipY: true,
        }),
        rect = getDrawingShapeGeometry(source)!.textRect!,
        placement = shapeTextEditorPlacement(source, fragment())!;
      if (preset === "rightArrow") expect(source.width - rect.right).not.toBeCloseTo(rect.left);
      else expect(source.height - rect.bottom).not.toBeCloseTo(rect.top);
      expect(placement.frame.transform).toBe("rotate(37deg)");
      expect(placement.input).toEqual({
        left: `${source.width - rect.right}px`,
        top: `${source.height - rect.bottom}px`,
        width: `${rect.right - rect.left}px`,
        height: `${rect.bottom - rect.top}px`,
        transform: "rotate(180deg)",
        transformOrigin: "50% 50%",
      });
    },
  );

  test("scales the actual local text rectangle once with independent fragment axes", () => {
    const source = drawing({ shapeGeometry: { preset: "rightArrow" }, shapeFlipX: true }),
      rect = getDrawingShapeGeometry(source)!.textRect!,
      placement = shapeTextEditorPlacement(
        source,
        fragment({ x: -12, y: 27, width: 200, height: 90 }),
      )!;
    expect(placement.frame).toMatchObject({
      left: "-12px",
      top: "27px",
      width: "200px",
      height: "90px",
      transform: "rotate(37deg)",
    });
    expect(placement.input).toEqual({
      left: `${(source.width - rect.right) * 2.5}px`,
      top: `${rect.top * 1.5}px`,
      width: `${(rect.right - rect.left) * 2.5}px`,
      height: `${(rect.bottom - rect.top) * 1.5}px`,
    });
  });

  test("does not invent an editor rectangle for a line", () => {
    expect(
      shapeTextEditorPlacement(drawing({ shapeGeometry: { preset: "line" } }), fragment()),
    ).toBeUndefined();
  });

  test.each([NaN, Infinity, -Infinity])("rejects non-finite frame rotation %s", (rotation) => {
    expect(shapeTextEditorPlacement(drawing({ rotation }), fragment())).toBeUndefined();
  });

  test.each([
    { x: NaN },
    { y: Infinity },
    { width: NaN },
    { height: -Infinity },
    { width: 0 },
    { height: 0 },
    { width: -1 },
    { height: -1 },
  ])("rejects an unusable viewport fragment %j", (changes) => {
    const viewport = fragment();
    expect(
      shapeTextEditorPlacement(drawing(), {
        ...viewport,
        rect: { ...viewport.rect, ...changes },
      }),
    ).toBeUndefined();
  });

  test.each([
    { width: NaN },
    { height: Infinity },
    { width: 0 },
    { height: 0 },
    { width: -1 },
    { height: -1 },
  ])("rejects a non-finite or empty real text-box rectangle %j", (changes) => {
    expect(
      shapeTextEditorPlacement(drawing({ kind: "textBox", ...changes }), fragment()),
    ).toBeUndefined();
  });
});
