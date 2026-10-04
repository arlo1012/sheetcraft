import { describe, expect, test } from "vitest";
import {
  createSetSheetPageDecorationCommand,
  tryApplyWorkbookCommand,
} from "../../commands/index.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
} from "../../serialization.js";
import { getActiveSheet } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

describe("sheet page decorations", () => {
  test("stores asset references, serializes them, and restores watermark edits through history", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const decoration = {
      backgroundAssetId: "asset-background",
      watermark: { text: "Internal", fontSize: 52, color: "#336699", opacity: 0.3, angle: -45 },
    };
    expect(
      executeWorkbookCommand(session, createSetSheetPageDecorationCommand(sheet.id, decoration)),
    ).toBe(true);
    expect(sheet.pageDecoration).toEqual(decoration);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.pageDecoration).toEqual({});
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(
      deserializeWorkbook(serializeWorkbook(session.workbook)).sheets.get(sheet.id)?.pageDecoration,
    ).toEqual(decoration);
  });

  test("rejects invalid watermark settings and respects sheet protection", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    expect(() =>
      createSetSheetPageDecorationCommand(sheet.id, {
        watermark: { text: "A", fontSize: 2, color: "#000000", opacity: 1, angle: 0 },
      }),
    ).toThrow("font size");
    sheet.properties.protected = true;
    expect(
      tryApplyWorkbookCommand(
        session.workbook,
        createSetSheetPageDecorationCommand(sheet.id, { backgroundAssetId: "asset" }),
      ).ok,
    ).toBe(false);
  });

  test("keeps decoration in a standalone sheet snapshot", () => {
    const sheet = getActiveSheet(createTestWorkbookSession().workbook);
    sheet.pageDecoration = {
      backgroundAssetId: "asset",
      watermark: { text: "Draft", fontSize: 48, color: "#808080", opacity: 0.25, angle: -45 },
    };
    expect(deserializeSheet(serializeSheet(sheet)).pageDecoration).toEqual(sheet.pageDecoration);
  });
});
