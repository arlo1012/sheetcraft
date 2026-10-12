import { describe, expect, test } from "vitest";
import {
  cloneCellContent,
  getActiveSheet,
  getCellContent,
  setCellContent,
} from "../../workbook.js";
import { translateCellContentForCopy } from "../../clipboard.js";
import { createSetCellContentCommand, createSortSheetRangeCommand } from "../../commands/index.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import { serializeWorkbook } from "../../serialization.js";
import { createTestWorkbookSession } from "../helpers.js";
import { framedCellImage } from "./fixture.js";

describe("local frame cell state", () => {
  test("cell edits compare complete normalized geometry and retain literal copy semantics", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    const image = framedCellImage(),
      content = { kind: "image", image } as const;
    expect(setCellContent(sheet, { row: 0, column: 0 }, content)).toBe(true);
    expect(setCellContent(sheet, { row: 0, column: 0 }, cloneCellContent(content))).toBe(false);
    expect(
      setCellContent(
        sheet,
        { row: 0, column: 0 },
        {
          kind: "image",
          image: { ...image, frame: { ...image.frame, angleDeg: image.frame.angleDeg + 360 } },
        },
      ),
    ).toBe(false);
    expect(
      setCellContent(
        sheet,
        { row: 0, column: 0 },
        {
          kind: "image",
          image: {
            ...image,
            frame: { ...image.frame, size: { ...image.frame.size, width: 999.125 } },
          },
        },
      ),
    ).toBe(true);
    const copy = translateCellContentForCopy(
      content,
      { row: 0, column: 0 },
      { row: 400, column: 200 },
    );
    expect(copy).toEqual(content);
    expect(copy).not.toBe(content);
    if (copy?.kind === "image" && copy.image.frame) {
      expect(copy.image.frame.source).not.toBe(image.frame.source);
      expect(copy.image.frame.size).not.toBe(image.frame.size);
      expect(Object.keys(copy.image.frame)).not.toContain("anchor");
    }
  });
  test("generic cell history and stable sort move the owned geometry without an anchor", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    const image = framedCellImage();
    const before = serializeWorkbook(session.workbook);
    executeWorkbookCommand(
      session,
      createSetCellContentCommand(sheet.id, { row: 0, column: 1 }, { kind: "image", image }),
    );
    const after = serializeWorkbook(session.workbook);
    expect(after.version).toBe(53);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: 2 });
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: 1 });
    const preSort = serializeWorkbook(session.workbook);
    executeWorkbookCommand(
      session,
      createSortSheetRangeCommand(
        sheet.id,
        { start: { row: 0, column: 0 }, end: { row: 1, column: 1 } },
        0,
      ),
    );
    expect(getCellContent(sheet, { row: 1, column: 1 })).toEqual({ kind: "image", image });
    expect(getCellContent(sheet, { row: 0, column: 1 })).toBeNull();
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(preSort);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getCellContent(sheet, { row: 1, column: 1 })).toEqual({ kind: "image", image });
  });
});
