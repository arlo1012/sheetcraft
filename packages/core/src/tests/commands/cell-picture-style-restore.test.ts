import { describe, expect, test } from "vitest";
import { createRestoreCellStylesCommand } from "../../commands/index.js";
import { executeWorkbookCommand } from "../../history.js";
import { serializeWorkbook } from "../../serialization.js";
import { getActiveSheet, getCellContent, setCellContent } from "../../workbook.js";
import type { CellImage, FramedCellImage } from "../../cell-picture-frame.js";
import { createTestWorkbookSession } from "../helpers.js";

function image(): FramedCellImage {
  return {
    assetId: "source",
    altText: "Picture",
    frame: {
      kind: "cell-picture-frame-v1",
      size: { width: 200, height: 100 },
      source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
      angleDeg: 37,
    },
  };
}

describe("cell picture style restoration admission", () => {
  test.each([
    ["frame size", (next: FramedCellImage): unknown => (next.frame.size.width = 201)],
    ["source geometry", (next: FramedCellImage): unknown => (next.frame.source.offsetXRatio = 0.2)],
    ["rotation", (next: FramedCellImage): unknown => (next.frame.angleDeg = 38)],
    ["shape", (next: FramedCellImage): unknown => (next.frame.cropShape = { preset: "ellipse" })],
    ["title", (next: FramedCellImage): unknown => (next.altTitle = "Changed")],
    ["lock", (next: FramedCellImage): unknown => (next.locked = false)],
    ["printing", (next: FramedCellImage): unknown => (next.printObject = false)],
    ["aspect ratio", (next: FramedCellImage): unknown => (next.lockAspectRatio = false)],
  ] as const)("cannot smuggle %s after an otherwise valid style restore", (_name, change) => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const address = { row: 0, column: 1 };
    const original = image();
    setCellContent(sheet, address, { kind: "image", image: original });
    const before = serializeWorkbook(session.workbook);
    const history = structuredClone(session.history);
    const next = structuredClone(original);
    change(next);
    expect(() =>
      executeWorkbookCommand(
        session,
        createRestoreCellStylesCommand(sheet.id, [
          { address: { row: 0, column: 0 }, style: { bold: true } },
          { address, style: { italic: true }, content: { kind: "image", image: next } },
        ]),
      ),
    ).toThrow();
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(session.history).toEqual(history);
  });

  test.each<CellImage>([image(), { assetId: "source", altText: "Picture", locked: false }])(
    "identical framed and legacy cell content may accompany a style restore: %j",
    (original) => {
      const session = createTestWorkbookSession();
      const sheet = getActiveSheet(session.workbook);
      const address = { row: 0, column: 0 };
      setCellContent(sheet, address, { kind: "image", image: original });
      expect(
        executeWorkbookCommand(
          session,
          createRestoreCellStylesCommand(sheet.id, [
            { address, style: { bold: true }, content: { kind: "image", image: original } },
          ]),
        ),
      ).toBe(true);
      expect(getCellContent(sheet, address)).toEqual({ kind: "image", image: original });
    },
  );

  test("legacy picture properties cannot be changed by a font-only content restore", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const address = { row: 0, column: 0 };
    setCellContent(sheet, address, {
      kind: "image",
      image: { assetId: "source", altText: "Picture" },
    });
    const before = serializeWorkbook(session.workbook);
    expect(() =>
      executeWorkbookCommand(
        session,
        createRestoreCellStylesCommand(sheet.id, [
          {
            address,
            style: null,
            content: {
              kind: "image",
              image: { assetId: "source", altText: "Picture", locked: false },
            },
          },
        ]),
      ),
    ).toThrow();
    expect(serializeWorkbook(session.workbook)).toEqual(before);
  });
});
