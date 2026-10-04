import { describe, expect, test } from "vitest";
import {
  createSetSheetsWatermarkCommand,
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
import { cloneSheetPageDecoration } from "../../page-decoration.js";
import { createSheet } from "../../workbook.js";
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

  test("round-trips and deep-clones image watermark settings", () => {
    const sheet = getActiveSheet(createTestWorkbookSession().workbook);
    const decoration = {
      watermark: {
        text: "Confidential",
        fontSize: 24,
        fontFamily: "Microsoft YaHei UI",
        color: "#c0c0c0",
        opacity: 0.5,
        angle: -45,
        image: { assetId: "asset-watermark", scale: null, washout: true, angle: 0 },
      },
    };
    sheet.pageDecoration = decoration;
    const cloned = cloneSheetPageDecoration(sheet.pageDecoration);
    cloned.watermark!.image!.assetId = "asset-other";
    expect(sheet.pageDecoration.watermark!.image!.assetId).toBe("asset-watermark");
    expect(deserializeSheet(serializeSheet(sheet)).pageDecoration).toEqual(decoration);
  });

  test("applies a watermark atomically to multiple sheets and restores each prior value once", () => {
    const session = createTestWorkbookSession();
    const first = getActiveSheet(session.workbook);
    const second = createSheet("Sheet2", "sheet-2");
    session.workbook.sheets.set(second.id, second);
    first.pageDecoration = { backgroundAssetId: "first-background" };
    second.pageDecoration = {
      backgroundAssetId: "second-background",
      watermark: { text: "Old", fontSize: 24, color: "#c0c0c0", opacity: 0.5, angle: -45 },
    };
    const watermark = {
      text: "Internal",
      fontSize: 24,
      color: "#c0c0c0",
      opacity: 0.5,
      angle: -45,
      image: { assetId: "asset-watermark", scale: 100, washout: true, angle: 0 },
    };
    const command = createSetSheetsWatermarkCommand([first.id, second.id], watermark);
    second.properties.protected = true;
    expect(tryApplyWorkbookCommand(session.workbook, command).ok).toBe(false);
    expect(first.pageDecoration).toEqual({ backgroundAssetId: "first-background" });
    expect(second.pageDecoration.watermark?.text).toBe("Old");

    second.properties.protected = false;
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(first.pageDecoration).toMatchObject({
      backgroundAssetId: "first-background",
      watermark,
    });
    expect(second.pageDecoration).toMatchObject({
      backgroundAssetId: "second-background",
      watermark,
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(first.pageDecoration).toEqual({ backgroundAssetId: "first-background" });
    expect(second.pageDecoration).toEqual({
      backgroundAssetId: "second-background",
      watermark: { text: "Old", fontSize: 24, color: "#c0c0c0", opacity: 0.5, angle: -45 },
    });
  });
});
