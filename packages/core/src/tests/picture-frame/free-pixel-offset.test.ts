import { describe, expect, test } from "vitest";
import {
  createSheet,
  getActiveSheet,
  setColumnWidth,
  setRowHeight,
  setSheetDimensionHidden,
} from "../../workbook.js";
import { createPictureSheetMetrics } from "../../picture-axis-metrics.js";
import {
  anchorPictureFrameRect,
  clonePictureFrame,
  normalizePictureFrameAnchor,
  pictureFrameContainsPoint,
  resizePictureCropFrame,
  resolvePictureFrame,
  type PictureFrame,
} from "../../picture-frame.js";
import { transformPictureFrameAxis } from "../../picture-frame-axis-edit.js";
import { groupPictureRoots, ungroupPictureRoot } from "../../picture-group-planning.js";
import { isPictureGroup } from "../../picture-group.js";
import { createTestWorkbookSession } from "../helpers.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import {
  createSetFloatingImageCommand,
  createSetSheetDimensionHiddenCommand,
  createSetSheetFloatingImagesCommand,
} from "../../commands/index.js";
import type { FramedFloatingImage } from "../../picture-object.js";

function frame(stretch = false): PictureFrame {
  return {
    kind: "object-frame-v1",
    anchor: stretch
      ? {
          mode: "move-and-size",
          offsetMode: "free-pixels",
          start: { column: { index: 0, offset: 110 }, row: { index: 0, offset: 2 } },
          end: { column: { index: 1, offset: 20 }, row: { index: 1, offset: 10 } },
        }
      : {
          mode: "move-only",
          offsetMode: "free-pixels",
          origin: { column: { index: 0, offset: 110.25 }, row: { index: 0, offset: 2 } },
          size: { width: 120, height: 80 },
        },
    source: { widthRatio: 1.5, heightRatio: 1.6, offsetXRatio: 0.06, offsetYRatio: -0.05 },
    angleDeg: 37,
    flipHorizontal: true,
  };
}
function fixture() {
  const sheet = createSheet("Free offsets", "s");
  for (let index = 0; index < 8; index++) {
    setColumnWidth(sheet, index, 100);
    setRowHeight(sheet, index, 24);
  }
  return { sheet, metrics: () => createPictureSheetMetrics(sheet) };
}

describe("explicit free-pixel picture anchor offsets", () => {
  test("keeps the original cell and 110.25px offset instead of applying the UI clamp", () => {
    const f = fixture(),
      original = frame();
    expect(resolvePictureFrame(original, f.metrics()).rect.x).toBe(110.25);
    const bounded = clonePictureFrame(original);
    if (bounded.anchor.mode === "fixed") throw Error("Wrong fixture");
    delete bounded.anchor.offsetMode;
    expect(resolvePictureFrame(bounded, f.metrics()).rect.x).toBe(100);
    expect(original.anchor).toMatchObject({
      offsetMode: "free-pixels",
      origin: { column: { index: 0, offset: 110.25 } },
    });
  });

  test("preserves untouched preferred points for reanchor and crop no-ops", () => {
    const f = fixture();
    for (const original of [frame(), frame(true)]) {
      const rect = resolvePictureFrame(original, f.metrics()).rect;
      expect(
        anchorPictureFrameRect(original.anchor.mode, rect, f.metrics(), original.anchor),
      ).toEqual(original.anchor);
      expect(
        resizePictureCropFrame(original, { width: rect.width, height: rect.height }, f.metrics()),
      ).toEqual(original);
      expect(clonePictureFrame(original)).toEqual(original);
    }
  });

  test("rebinds a moved coordinate while retaining the explicit relative pixel semantics", () => {
    const f = fixture(),
      original = frame();
    const rect = resolvePictureFrame(original, f.metrics()).rect;
    const moved = anchorPictureFrameRect(
      "move-only",
      { ...rect, x: rect.x + 100 },
      f.metrics(),
      original.anchor,
    );
    expect(moved).toMatchObject({
      offsetMode: "free-pixels",
      origin: { column: { index: 2, offset: 10.25 } },
    });
    expect(anchorPictureFrameRect("move-only", rect, f.metrics())).not.toHaveProperty("offsetMode");
    expect(anchorPictureFrameRect("fixed", rect, f.metrics(), original.anchor)).not.toHaveProperty(
      "offsetMode",
    );
  });

  test("collapses only derived reverse spans and restores original points after unhide", () => {
    const f = fixture(),
      original = frame(true),
      before = clonePictureFrame(original);
    expect(resolvePictureFrame(original, f.metrics()).rect.width).toBe(10);
    setSheetDimensionHidden(f.sheet, "column", 0, true);
    const collapsed = resolvePictureFrame(original, f.metrics());
    expect(collapsed.rect).toMatchObject({ x: 110, width: 0 });
    expect(collapsed.collapsed).toBe(true);
    expect(collapsed.sourceRect).toBeNull();
    expect(pictureFrameContainsPoint(collapsed, { x: 110, y: 2 })).toBe(false);
    expect(() => resizePictureCropFrame(original, { width: 20, height: 20 }, f.metrics())).toThrow(
      /collapsed/,
    );
    expect(original).toEqual(before);
    setSheetDimensionHidden(f.sheet, "column", 0, false);
    expect(resolvePictureFrame(original, f.metrics()).rect.width).toBe(10);
  });

  test("uses visible prefixes but keeps the full offset when its own cell is hidden", () => {
    const f = fixture(),
      original = frame();
    if (original.anchor.mode !== "move-only") throw Error("Wrong fixture");
    original.anchor.origin.column.index = 1;
    expect(resolvePictureFrame(original, f.metrics()).rect.x).toBe(210.25);
    setSheetDimensionHidden(f.sheet, "column", 0, true);
    setSheetDimensionHidden(f.sheet, "column", 1, true);
    expect(resolvePictureFrame(original, f.metrics()).rect.x).toBe(110.25);
    expect(original.anchor.origin.column).toEqual({ index: 1, offset: 110.25 });
  });

  test("axis edits move original cell bindings, preserve raw offsets and consume only logical stretches", () => {
    const f = fixture(),
      original = frame();
    const inserted = transformPictureFrameAxis(
      original,
      { axis: "column", operation: "insert", index: 0, count: 1 },
      f.metrics(),
    )!;
    expect(inserted.anchor).toMatchObject({
      offsetMode: "free-pixels",
      origin: { column: { index: 1, offset: 110.25 } },
    });
    const restored = transformPictureFrameAxis(
      inserted,
      { axis: "column", operation: "delete", index: 0, count: 1 },
      f.metrics(),
    );
    expect(restored).toEqual(original);
    expect(
      transformPictureFrameAxis(
        frame(true),
        { axis: "column", operation: "delete", index: 0, count: 2 },
        f.metrics(),
      ),
    ).toBeNull();
  });

  test.each([undefined, "", "free-emu", "bounded", true])(
    "rejects an owned unknown offset mode %s",
    (offsetMode) => {
      expect(() => normalizePictureFrameAnchor({ ...frame().anchor, offsetMode } as never)).toThrow(
        /offset mode/,
      );
    },
  );
  test("does not silently discard an inherited native offset policy", () => {
    const original = frame();
    if (original.anchor.mode === "fixed") throw Error("Wrong fixture");
    delete original.anchor.offsetMode;
    const inherited = Object.assign(Object.create({ offsetMode: "free-pixels" }), original.anchor);
    expect(() => normalizePictureFrameAnchor(inherited)).toThrow(/own data/);
  });
  test("does not expand fixed-anchor keys or nonleading negative offset support", () => {
    expect(() =>
      normalizePictureFrameAnchor({
        mode: "fixed",
        x: 0,
        y: 0,
        size: { width: 20, height: 20 },
        offsetMode: "free-pixels",
      } as never),
    ).toThrow(/field/);
    const original = frame();
    if (original.anchor.mode !== "move-only") throw Error("Wrong fixture");
    original.anchor.origin.column = { index: 1, offset: -1 };
    expect(() => clonePictureFrame(original)).toThrow(/leading/);
  });

  test("explicit grouping rebinds roots while undo restores their original free markers", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    setColumnWidth(sheet, 0, 100);
    const first: FramedFloatingImage = {
      id: "first",
      assetId: "source",
      altText: "",
      frame: frame(),
    };
    const second: FramedFloatingImage = {
      id: "second",
      assetId: "source",
      altText: "",
      frame: frame(),
    };
    if (second.frame.anchor.mode !== "move-only") throw Error("Wrong fixture");
    second.frame.anchor.origin.column.index = 3;
    sheet.floatingImages = [first, second];
    const original = structuredClone(sheet.floatingImages),
      metrics = createPictureSheetMetrics(sheet);
    const grouped = groupPictureRoots(
      sheet.floatingImages,
      ["first", "second"],
      { id: "group", altText: "" },
      metrics,
    );
    expect(isPictureGroup(grouped[0]!)).toBe(true);
    if (!isPictureGroup(grouped[0]!)) throw Error("Expected group");
    expect(grouped[0].frame.anchor).not.toHaveProperty("offsetMode");
    expect(
      executeWorkbookCommand(session, createSetSheetFloatingImagesCommand(sheet.id, grouped)),
    ).toBe(true);
    const ungrouped = ungroupPictureRoot(sheet.floatingImages, "group", metrics);
    expect(
      ungrouped.every((image) => "frame" in image && !("offsetMode" in image.frame.anchor)),
    ).toBe(true);
    expect(
      executeWorkbookCommand(session, createSetSheetFloatingImagesCommand(sheet.id, ungrouped)),
    ).toBe(true);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.floatingImages).toEqual(original);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(sheet.floatingImages).toEqual(ungrouped);
  });

  test("command history restores free markers and recoverable collapsed geometry", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    setColumnWidth(sheet, 0, 100);
    setColumnWidth(sheet, 1, 100);
    const picture: FramedFloatingImage = {
      id: "free",
      assetId: "source",
      altText: "",
      frame: frame(true),
    };
    expect(executeWorkbookCommand(session, createSetFloatingImageCommand(sheet.id, picture))).toBe(
      true,
    );
    expect(
      executeWorkbookCommand(
        session,
        createSetSheetDimensionHiddenCommand(sheet.id, "column", [0], true),
      ),
    ).toBe(true);
    const current = () => (sheet.floatingImages[0] as FramedFloatingImage).frame;
    expect(resolvePictureFrame(current(), createPictureSheetMetrics(sheet)).collapsed).toBe(true);
    expect(current().anchor).toEqual(picture.frame.anchor);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(resolvePictureFrame(current(), createPictureSheetMetrics(sheet)).rect.width).toBe(10);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(resolvePictureFrame(current(), createPictureSheetMetrics(sheet)).sourceRect).toBeNull();
    expect(current().anchor).toEqual(picture.frame.anchor);
  });
});
