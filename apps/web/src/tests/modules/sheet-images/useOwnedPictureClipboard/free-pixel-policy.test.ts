import { describe, expect, test } from "vitest";
import { anchorPictureFrameRect } from "@sheetcraft/core/picture-frame";
import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import { isPictureGroup } from "@sheetcraft/core/picture-group";
import { createSheet } from "@sheetcraft/core/workbook";
import { context, fixture, rect } from "./fixture";

describe("owned clipboard free-pixel marker policy", () => {
  test.each(
    (["move-only", "move-and-size"] as const).flatMap((mode) =>
      ["framed", "owned-group"].map((id) => ({ mode, id })),
    ),
  )(
    "$id $mode rebuilds destination points but retains only the relative policy",
    async ({ mode, id }) => {
      const f = fixture();
      const root = f.sheet.floatingImages.find((entry) => entry.id === id)!;
      if (!isFramedPictureObject(root) && !isPictureGroup(root))
        throw new Error("Expected framed root.");
      const start = { column: { index: 0, offset: 110 }, row: { index: 0, offset: 5 } };
      root.frame.anchor =
        mode === "move-only"
          ? { mode, offsetMode: "free-pixels", origin: start, size: { width: 80, height: 40 } }
          : {
              mode,
              offsetMode: "free-pixels",
              start,
              end: { column: { index: 2, offset: 40 }, row: { index: 2, offset: 5 } },
            };
      const before = structuredClone(root);
      const originalRect = rect(root, f.getContext());
      await f.clipboard.copy([[id]], "copy");
      const destination = createSheet("Destination", "destination");
      destination.columnWidths.set(0, 50);
      destination.columnWidths.set(1, 60);
      destination.columnWidths.set(2, 40);
      f.session.workbook.sheets.set(destination.id, destination);
      f.setSheet(destination);
      f.setGeneration(4);
      const destinationContext = context(destination);
      f.setContext(destinationContext);
      const address = { row: 0, column: 2 };
      const cell = destinationContext.layout.getCellRect(address)!;
      // This physical x equals the raw source offset, so passing source preferred
      // points would accidentally preserve the wrong column-0 binding here.
      expect(cell.x).toBe(110);
      expect(f.clipboard.paste(address)).toBe(true);
      expect(f.execute).toHaveBeenCalledOnce();
      const copied = destination.floatingImages[0]!;
      if (!isFramedPictureObject(copied) && !isPictureGroup(copied))
        throw new Error("Expected framed copy.");
      const destinationRect = { ...originalRect, x: cell.x, y: cell.y };
      expect(copied.frame.anchor).toEqual({
        ...anchorPictureFrameRect(mode, destinationRect, destinationContext.metrics),
        offsetMode: "free-pixels",
      });
      expect(rect(copied, destinationContext)).toEqual(destinationRect);
      if (isFramedPictureObject(copied) && isFramedPictureObject(root))
        expect(copied.frame.source).toEqual(root.frame.source);
      expect(root).toEqual(before);
    },
  );

  test("fixed pasted roots never acquire a relative offset policy", async () => {
    const f = fixture();
    await f.clipboard.copy([["framed"]], "copy");
    expect(f.clipboard.paste({ row: 4, column: 3 })).toBe(true);
    const copied = f.sheet.floatingImages.at(-1)!;
    if (!isFramedPictureObject(copied)) throw new Error("Expected framed picture.");
    expect(copied.frame.anchor.mode).toBe("fixed");
    expect(copied.frame.anchor).not.toHaveProperty("offsetMode");
  });
});
