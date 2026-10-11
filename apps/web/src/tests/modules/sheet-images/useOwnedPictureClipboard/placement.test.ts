import { describe, expect, test } from "vitest";
import { anchorPictureFrameRect, resolvePictureFrame } from "@sheetcraft/core/picture-frame";
import { isPictureGroup } from "@sheetcraft/core/picture-group";
import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import { createSheet } from "@sheetcraft/core/workbook";
import { context, fixture, rect } from "./fixture";

describe("owned clipboard destination placement", () => {
  test.each(["fixed", "move-only", "move-and-size"] as const)(
    "%s uses captured effective AutoFit geometry and the destination effective metrics",
    async (mode) => {
      const f = fixture();
      const root = f.sheet.floatingImages[0]!;
      if (!isFramedPictureObject(root)) throw new Error("Expected framed picture.");
      root.frame.anchor = anchorPictureFrameRect(
        mode,
        { x: 140, y: 12, width: 105, height: 100 },
        f.getContext().metrics,
      );
      const original = rect(root, f.getContext());
      const source = structuredClone(root.frame.source);
      await f.clipboard.copy([[root.id]], "copy");
      const destination = createSheet("Destination", "destination");
      destination.columnWidths.set(0, 145);
      destination.columnWidths.set(1, 40);
      f.session.workbook.sheets.set(destination.id, destination);
      f.setSheet(destination);
      f.setGeneration(4);
      const effective = new Map([
        [0, 61],
        [1, 73],
        [2, 41],
      ]);
      const destinationContext = context(destination, effective);
      f.setContext(destinationContext);
      const cell = destinationContext.layout.getCellRect({ row: 4, column: 3 })!;
      expect(f.clipboard.paste({ row: 4, column: 3 })).toBe(true);
      const copy = destination.floatingImages[0]!;
      if (!isFramedPictureObject(copy)) throw new Error("Expected framed picture.");
      const actual = resolvePictureFrame(copy.frame, destinationContext.metrics);
      expect(actual.rect.x).toBeCloseTo(cell.x);
      expect(actual.rect.y).toBeCloseTo(cell.y);
      expect(actual.rect.width).toBeCloseTo(original.width);
      expect(actual.rect.height).toBeCloseTo(original.height);
      expect(copy.frame.anchor.mode).toBe(mode);
      expect(copy.frame.source).toEqual(source);
      expect(copy.frame.angleDeg).toBe(root.frame.angleDeg);
    },
  );

  test("mixed roots shift their unrotated union NW to the sheet cell without viewport scroll", async () => {
    const f = fixture();
    const originals = f.sheet.floatingImages.map((root) => rect(root, f.getContext()));
    const left = Math.min(...originals.map((value) => value.x));
    const top = Math.min(...originals.map((value) => value.y));
    await f.clipboard.copy([["legacy"], ["framed"], ["owned-group"]], "copy");
    const address = { row: 7, column: 4 };
    const cell = f.getContext().layout.getCellRect(address)!;
    expect(f.clipboard.paste(address)).toBe(true);
    const copies = f.sheet.floatingImages.slice(3);
    copies.forEach((root, index) => {
      const actual = rect(root, f.getContext());
      expect(actual.x).toBeCloseTo(cell.x + originals[index]!.x - left);
      expect(actual.y).toBeCloseTo(cell.y + originals[index]!.y - top);
      expect(actual.width).toBeCloseTo(originals[index]!.width);
      expect(actual.height).toBeCloseTo(originals[index]!.height);
    });
    expect(copies.map((root) => isPictureGroup(root))).toEqual([false, true, false]);
  });

  test.each([90, 270] as const)("legacy %d° keeps the actual old display box", async (rotation) => {
    const f = fixture();
    const legacy = f.sheet.floatingImages[2]!;
    if (isFramedPictureObject(legacy) || isPictureGroup(legacy))
      throw new Error("Expected legacy.");
    legacy.transform = { rotation, flipHorizontal: true };
    const framed = f.sheet.floatingImages[0]!;
    if (!isFramedPictureObject(framed)) throw new Error("Expected framed picture.");
    framed.frame.anchor = { mode: "fixed", x: 215, y: 104, size: { width: 20, height: 20 } };
    const legacySource = rect(legacy, f.getContext());
    const frameSource = rect(framed, f.getContext());
    await f.clipboard.copy([["legacy"], ["framed"]], "copy");
    const address = { row: 4, column: 3 };
    const cell = f.getContext().layout.getCellRect(address)!;
    f.clipboard.paste(address);
    const copied = f.sheet.floatingImages.at(-1)!;
    if (isFramedPictureObject(copied) || isPictureGroup(copied))
      throw new Error("Expected legacy.");
    expect(copied.width).toBe(70);
    expect(copied.height).toBe(50);
    expect(copied.transform).toEqual(legacy.transform);
    expect(rect(copied, f.getContext()).x).toBeCloseTo(
      cell.x + legacySource.x - Math.min(legacySource.x, frameSource.x),
    );
    expect(rect(copied, f.getContext()).y).toBeCloseTo(
      cell.y + legacySource.y - Math.min(legacySource.y, frameSource.y),
    );
    expect(copied.anchor).toEqual(address);
  });

  test("unrepresentable collapsed root rejects the whole collection without partial placement", async () => {
    const f = fixture();
    const root = f.sheet.floatingImages[0]!;
    if (!isFramedPictureObject(root)) throw new Error("Expected framed picture.");
    root.frame.anchor = {
      mode: "move-and-size",
      start: { row: { index: 0, offset: 0 }, column: { index: 0, offset: 0 } },
      end: { row: { index: 1, offset: 0 }, column: { index: 1, offset: 0 } },
    };
    f.sheet.hiddenRows = new Set([0]);
    f.setContext(context(f.sheet));
    await f.clipboard.copy([["framed"], ["owned-group"]], "copy");
    expect(f.clipboard.paste({ row: 5, column: 5 })).toBe(true);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.sheet.floatingImages).toHaveLength(3);
    expect(f.clipboard.hasPending()).toBe(true);
    expect(f.onFeedback).toHaveBeenLastCalledWith("clipboard.pasteRejected");
  });

  test("hidden destination cell rejects the complete pending cut and retains it", async () => {
    const f = fixture();
    f.sheet.hiddenRows = new Set([8]);
    f.setContext(context(f.sheet));
    await f.clipboard.copy([["owned-group"]], "cut");
    expect(f.clipboard.paste({ row: 8, column: 4 })).toBe(true);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.clipboard.hasPending()).toBe(true);
  });
});
