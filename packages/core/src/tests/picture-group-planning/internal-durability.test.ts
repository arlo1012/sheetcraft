import { describe, expect, test } from "vitest";
import { createTestWorkbookSession } from "../helpers.js";
import {
  getActiveSheet,
  createSheet,
  createSheetSparseState,
  setCellContent,
  getCellContent,
} from "../../workbook.js";
import {
  serializeWorkbook,
  deserializeWorkbook,
  serializeSheet,
  deserializeSheet,
} from "../../serialization.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import {
  createSetSheetFloatingImagesCommand,
  createSetFloatingImageCommand,
  createInsertSheetAxisCommand,
  createConvertCellImageToFloatingCommand,
  createDeleteSheetAxisCommand,
  createSetSheetDimensionHiddenCommand,
  applyWorkbookCommand,
} from "../../commands/index.js";
import {
  applyRestoreTableTransactionCommand,
  createRestoreTableTransactionCommand,
} from "../../tables.js";
import { groupPictureRoots } from "../../picture-group-planning.js";
import { normalizePictureObjectCollection } from "../../picture-object.js";
import { resolvePictureGroup } from "../../picture-group-layout.js";
import { createPictureSheetMetrics } from "../../picture-axis-metrics.js";
import { isPictureGroup } from "../../picture-group.js";
import { fixture, groupedFixture, picture } from "./fixture.js";

describe("owned group internal persistence and transactions", () => {
  test("grouping is one undoable collection transaction and undo restores exact prior roots", () => {
    const f = fixture();
    const before = serializeWorkbook(f.session.workbook);
    const next = groupPictureRoots(
      f.sheet.floatingImages,
      ["a", "b"],
      { id: "g", altText: "Group" },
      f.metrics,
    );
    expect(
      executeWorkbookCommand(f.session, createSetSheetFloatingImagesCommand(f.sheet.id, next)),
    ).toBe(true);
    const after = serializeWorkbook(f.session.workbook);
    expect(after.version).toBe(48);
    expect(f.session.history.undoStack.length).toBe(1);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(after);
  });
  test("v48 and isolated-sheet persistence retain every local source and child without upgrading old documents", () => {
    const f = groupedFixture();
    const snapshot = serializeWorkbook(f.session.workbook);
    expect(snapshot.version).toBe(48);
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    expect(serializeSheet(deserializeSheet(serializeSheet(f.sheet)))).toEqual(
      serializeSheet(f.sheet),
    );
    expect(() => deserializeWorkbook({ ...snapshot, version: 47 })).toThrow(/48/);
    const plain = createTestWorkbookSession();
    expect(serializeWorkbook(plain.workbook).version).toBe(43);
    getActiveSheet(plain.workbook).floatingImages = [picture("frame", 0)];
    expect(serializeWorkbook(plain.workbook).version).toBe(47);
  });
  test("a new root cannot steal a descendant ID and duplicate forests reject before mutation", () => {
    const f = groupedFixture();
    const before = serializeWorkbook(f.session.workbook);
    expect(() =>
      applyWorkbookCommand(
        f.session.workbook,
        createSetFloatingImageCommand(f.sheet.id, picture("a", 0)),
      ),
    ).toThrow(/Duplicate/);
    expect(() =>
      normalizePictureObjectCollection([...f.sheet.floatingImages, picture("b", 0)]),
    ).toThrow(/Duplicate/);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.session.history.undoStack.length).toBe(0);
  });
  test("hiding a complete stretch keeps the subtree; complete deletion consumes it and undo restores all ownership", () => {
    const f = groupedFixture();
    const group = f.group;
    if (group.frame.anchor.mode !== "move-and-size") throw Error("Expected stretching group");
    const before = serializeWorkbook(f.session.workbook);
    const start = group.frame.anchor.start.row.index;
    const count = group.frame.anchor.end.row.index - start + 1;
    expect(
      executeWorkbookCommand(
        f.session,
        createSetSheetDimensionHiddenCommand(
          f.sheet.id,
          "row",
          Array.from({ length: count }, (_, index) => start + index),
          true,
        ),
      ),
    ).toBe(true);
    expect(f.sheet.floatingImages.some(isPictureGroup)).toBe(true);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(
      executeWorkbookCommand(
        f.session,
        createDeleteSheetAxisCommand(f.sheet.id, "row", start, count),
      ),
    ).toBe(true);
    expect(f.sheet.floatingImages.some(isPictureGroup)).toBe(false);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });
  test("multi-sheet restore preflights every owning tree before changing the first sheet", () => {
    const f = groupedFixture();
    const second = createSheet("Second", "second");
    f.session.workbook.sheets.set(second.id, second);
    const command = createRestoreTableTransactionCommand(f.session.workbook);
    command.states[0]!.state.floatingImages = [];
    const badState = createSheetSparseState(second);
    badState.floatingImages = [f.group, picture("a", 0)];
    command.states[1]!.state = badState;
    const before = serializeWorkbook(f.session.workbook);
    expect(() => applyRestoreTableTransactionCommand(f.session.workbook, command)).toThrow(
      /Duplicate/,
    );
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });
  test("cell-to-floating conversion cannot steal an owned descendant ID or change the cell on rejection", () => {
    const f = groupedFixture();
    const address = { row: 0, column: 0 };
    setCellContent(f.sheet, address, {
      kind: "image",
      image: { assetId: "cell-asset", altText: "Cell" },
    });
    const before = serializeWorkbook(f.session.workbook);
    expect(() =>
      applyWorkbookCommand(
        f.session.workbook,
        createConvertCellImageToFloatingCommand(f.sheet.id, address, "a", {
          width: 100,
          height: 80,
        }),
      ),
    ).toThrow(/Duplicate/);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(getCellContent(f.sheet, address)?.kind).toBe("image");
  });
  test("a cell conversion inverse cannot introduce a duplicate descendant before restoring cell content", () => {
    const f = groupedFixture();
    const address = { row: 0, column: 0 };
    setCellContent(f.sheet, address, { kind: "literal", value: "Keep" });
    const before = serializeWorkbook(f.session.workbook);
    expect(() =>
      applyWorkbookCommand(f.session.workbook, {
        type: "restoreFloatingImageToCell",
        sheetId: f.sheet.id,
        index: 0,
        address,
        image: {
          id: "a",
          assetId: "cell-asset",
          altText: "Cell",
          anchor: address,
          offsetX: 0,
          offsetY: 0,
          width: 100,
          height: 80,
        },
        content: null,
      }),
    ).toThrow(/Duplicate/);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });
  test("cell conversion respects the combined root and descendant node budget atomically", () => {
    const f = groupedFixture();
    const address = { row: 0, column: 0 };
    const roots = Array.from({ length: 9996 }, (_, index) => ({
      id: `legacy-${index}`,
      assetId: "asset",
      altText: "Budget",
      anchor: address,
      offsetX: 0,
      offsetY: 0,
      width: 1,
      height: 1,
    }));
    f.sheet.floatingImages = normalizePictureObjectCollection([
      ...f.sheet.floatingImages,
      ...roots,
    ]);
    setCellContent(f.sheet, address, {
      kind: "image",
      image: { assetId: "cell-asset", altText: "Cell" },
    });
    const before = serializeWorkbook(f.session.workbook);
    expect(() =>
      applyWorkbookCommand(
        f.session.workbook,
        createConvertCellImageToFloatingCommand(f.sheet.id, address, "new-root", {
          width: 100,
          height: 80,
        }),
      ),
    ).toThrow(/budget|maximum|nodes|10000/i);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });

  test("axis insertion validates hidden leaf source geometry against the next dimensions before moving any cells", () => {
    const f = groupedFixture();
    const group = f.group;
    group.frame = {
      kind: "group-frame-v1",
      angleDeg: 0,
      anchor: {
        mode: "move-and-size",
        start: { row: { index: 0, offset: 0 }, column: { index: 0, offset: 0 } },
        end: { row: { index: 1, offset: 0 }, column: { index: 2, offset: 0 } },
      },
    };
    const leaf = group.members[0]!;
    if (leaf.kind !== "grouped-picture-v1") throw Error("Expected leaf");
    leaf.hidden = true;
    leaf.frame.rect = { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 };
    leaf.frame.angleDeg = 0;
    leaf.frame.source = { widthRatio: 8e305, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 };
    f.sheet.floatingImages = [group];
    setCellContent(f.sheet, { row: 0, column: 2 }, { kind: "literal", value: "Keep" });
    resolvePictureGroup(group, createPictureSheetMetrics(f.sheet));
    const before = serializeWorkbook(f.session.workbook);
    expect(() =>
      applyWorkbookCommand(
        f.session.workbook,
        createInsertSheetAxisCommand(f.sheet.id, "column", 1, 1),
      ),
    ).toThrow(/finite|representable|geometry/i);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });
  test("snapshot root-array overrides and data accessors reject before dropping or reading owned trees", () => {
    const f = groupedFixture();
    const snapshot = serializeWorkbook(f.session.workbook);
    let reads = 0;
    const roots = snapshot.sheets[0]!.floatingImages;
    Object.defineProperty(roots, "map", {
      value: () => {
        reads++;
        return [];
      },
    });
    expect(() => deserializeWorkbook(snapshot)).toThrow(/indexed data array/);
    const clean = serializeWorkbook(f.session.workbook);
    Object.defineProperty(clean.sheets[0]!, "floatingImages", {
      get: () => {
        reads++;
        return roots;
      },
    });
    expect(() => deserializeWorkbook(clean)).toThrow(/data fields/);
    expect(reads).toBe(0);
  });
});
