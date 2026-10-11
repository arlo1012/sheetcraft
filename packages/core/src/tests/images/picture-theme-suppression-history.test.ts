import { describe, expect, test } from "vitest";
import { applyWorkbookCommand, createSetSheetFloatingImagesCommand } from "../../commands/index.js";
import { createSetCellContentCommand } from "../../commands/values.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { serializeWorkbook } from "../../serialization.js";
import { isPictureGroup } from "../../picture-group.js";
import { getActiveSheet, getCellContent, type FloatingImage } from "../../workbook.js";
import { childNodes, fixture } from "../picture-group-edit/fixture.js";
import { picture } from "../picture-group-planning/fixture.js";
import { createTestWorkbookSession } from "../helpers.js";

describe("picture theme suppression history", () => {
  test("cell suppression remains detached and restores exact state through undo and redo", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const before = serializeWorkbook(session.workbook);
    const flags = { shadow: true as const };
    const command = createSetCellContentCommand(
      sheet.id,
      { row: 0, column: 0 },
      {
        kind: "image",
        image: {
          assetId: "cell",
          altText: "",
          transform: { appearance: { suppressThemeEffects: flags } },
        },
      },
    );
    delete (flags as { shadow?: true }).shadow;
    expect(executeWorkbookCommand(session, command)).toBe(true);
    const after = serializeWorkbook(session.workbook);
    expect(after.version).toBe(49);
    const read = getCellContent(sheet, { row: 0, column: 0 });
    if (read?.kind !== "image") throw Error("Expected an image");
    delete read.image.transform!.appearance!.suppressThemeEffects!.shadow;
    expect(serializeWorkbook(session.workbook)).toEqual(after);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
  });

  test("a complete forest edit preserves root and nested leaf suppression with one history entry", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const f = fixture();
    const before = serializeWorkbook(session.workbook);
    f.picture.transform!.appearance!.suppressThemeEffects = { outline: true, bevel: true };
    const root = picture("standalone", 600);
    root.transform!.appearance!.suppressThemeEffects = { reflection: true };
    const command = createSetSheetFloatingImagesCommand(sheet.id, [root, f.root]);
    delete f.picture.transform!.appearance!.suppressThemeEffects.outline;
    expect(executeWorkbookCommand(session, command)).toBe(true);
    const after = serializeWorkbook(session.workbook);
    expect(after.version).toBe(49);
    expect(session.history.undoStack).toHaveLength(1);
    const stored = sheet.floatingImages[1]!;
    if (!isPictureGroup(stored)) throw Error("Expected an owned group");
    expect(childNodes(stored).picture.transform!.appearance!.suppressThemeEffects).toEqual({
      outline: true,
      bevel: true,
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
  });

  test("a malformed later leaf rejects the entire forest before mutation or history changes", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    sheet.floatingImages = [picture("existing", 0)];
    const f = fixture();
    f.picture.transform!.appearance!.suppressThemeEffects = { outline: false } as unknown as {
      outline: true;
    };
    const images: FloatingImage[] = [picture("valid", 100), f.root];
    const before = serializeWorkbook(session.workbook);
    expect(() => createSetSheetFloatingImagesCommand(sheet.id, images)).toThrow(/explicitly true/);
    expect(() =>
      applyWorkbookCommand(session.workbook, {
        type: "setSheetFloatingImages",
        sheetId: sheet.id,
        images,
      }),
    ).toThrow(/explicitly true/);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(session.history.undoStack).toHaveLength(0);
  });
});
