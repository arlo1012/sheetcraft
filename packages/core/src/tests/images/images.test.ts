import { describe, expect, test } from "vitest";
import {
  applyWorkbookCommand,
  createDeleteFloatingImageCommand,
  createDeleteSheetCommand,
  createDuplicateSheetCommand,
  createSetCellContentCommand,
  createSetFloatingImageCommand,
  createDeleteSheetAxisCommand,
  createInsertSheetAxisCommand,
  createResizeSheetDimensionCommand,
  createSortSheetRangeCommand,
} from "../../commands/index.js";
import { translateCellContentForCopy } from "../../clipboard.js";
import { formatCellContentForInput } from "../../input.js";
import { createFormulaError } from "../../formula/types.js";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import {
  createSheetSparseState,
  getActiveSheet,
  getCellComputedValue,
  getCellContent,
} from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

const image = {
  id: "floating-image-1",
  assetId: "asset-1",
  altText: "Chart",
  anchor: { row: 3, column: 2 },
  offsetX: 12,
  offsetY: 8,
  width: 160,
  height: 90,
};

describe("sheet images", () => {
  test("stores an image-exclusive cell, projects it as a value error, and restores overwrite", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    applyWorkbookCommand(
      session.workbook,
      createSetCellContentCommand(
        sheet.id,
        { row: 1, column: 1 },
        {
          kind: "image",
          image: { assetId: "asset-cell", altText: "Revenue chart" },
        },
      ),
    );
    expect(formatCellContentForInput(getCellContent(sheet, { row: 1, column: 1 }))).toBe("");
    expect(getCellComputedValue(sheet, { row: 1, column: 1 })).toEqual({
      kind: "formula-error",
      code: "VALUE",
    });

    const inverse = applyWorkbookCommand(
      session.workbook,
      createSetCellContentCommand(
        sheet.id,
        { row: 1, column: 1 },
        { kind: "literal", value: "text" },
      ),
    );
    expect(inverse).not.toBeNull();
    applyWorkbookCommand(session.workbook, inverse!);
    expect(getCellContent(sheet, { row: 1, column: 1 })).toEqual({
      kind: "image",
      image: { assetId: "asset-cell", altText: "Revenue chart" },
    });
  });

  test("validates, updates, deletes, and restores a floating image with serialized inverses", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const inverse = applyWorkbookCommand(
      session.workbook,
      createSetFloatingImageCommand(sheet.id, image),
    );
    expect(JSON.parse(JSON.stringify(inverse))).toEqual(inverse);
    expect(sheet.floatingImages).toEqual([image]);
    applyWorkbookCommand(
      session.workbook,
      createSetFloatingImageCommand(sheet.id, { ...image, id: "floating-image-2" }),
    );
    applyWorkbookCommand(
      session.workbook,
      createSetFloatingImageCommand(sheet.id, { ...image, id: "floating-image-3" }),
    );
    const deleteInverse = applyWorkbookCommand(
      session.workbook,
      createDeleteFloatingImageCommand(sheet.id, "floating-image-2"),
    );
    expect(sheet.floatingImages.map((item) => item.id)).toEqual([
      "floating-image-1",
      "floating-image-3",
    ]);
    applyWorkbookCommand(session.workbook, deleteInverse!);
    expect(sheet.floatingImages.map((item) => item.id)).toEqual([
      "floating-image-1",
      "floating-image-2",
      "floating-image-3",
    ]);
    expect(() => createSetFloatingImageCommand(sheet.id, { ...image, width: 0 })).toThrow();
    expect(() => createSetFloatingImageCommand(sheet.id, { ...image, offsetX: -1 })).toThrow();
  });

  test("moves anchors for insert, removes deleted anchors, and restores the exact sparse state", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    applyWorkbookCommand(session.workbook, createSetFloatingImageCommand(sheet.id, image));
    const before = createSheetSparseState(sheet);
    const insertInverse = applyWorkbookCommand(
      session.workbook,
      createInsertSheetAxisCommand(sheet.id, "row", 2),
    );
    expect(sheet.floatingImages[0]?.anchor).toEqual({ row: 4, column: 2 });
    applyWorkbookCommand(session.workbook, insertInverse!);
    expect(createSheetSparseState(sheet)).toEqual(before);

    const deleteInverse = applyWorkbookCommand(
      session.workbook,
      createDeleteSheetAxisCommand(sheet.id, "column", 2),
    );
    expect(sheet.floatingImages).toEqual([]);
    applyWorkbookCommand(session.workbook, deleteInverse!);
    expect(createSheetSparseState(sheet)).toEqual(before);
  });

  test("round trips V4 image references without binary data", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    applyWorkbookCommand(session.workbook, createSetFloatingImageCommand(sheet.id, image));
    applyWorkbookCommand(
      session.workbook,
      createSetCellContentCommand(
        sheet.id,
        { row: 0, column: 0 },
        {
          kind: "image",
          image: { assetId: "asset-cell", altText: "Cell chart" },
        },
      ),
    );
    const snapshot = serializeWorkbook(session.workbook);
    expect(snapshot.version).toBe(4);
    expect(JSON.stringify(snapshot)).not.toContain("data:");
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
  });

  test("copies in-cell images, preserves floating dimensions on resize, and sorts image cells", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const cellImage = {
      kind: "image" as const,
      image: { assetId: "asset-cell", altText: "Cell chart" },
    };
    expect(
      translateCellContentForCopy(cellImage, { row: 0, column: 0 }, { row: 4, column: 5 }),
    ).toEqual(cellImage);
    applyWorkbookCommand(session.workbook, createSetFloatingImageCommand(sheet.id, image));
    applyWorkbookCommand(
      session.workbook,
      createResizeSheetDimensionCommand(sheet.id, "row", image.anchor.row, 40),
    );
    expect(sheet.floatingImages[0]).toMatchObject({ width: 160, height: 90 });
    applyWorkbookCommand(
      session.workbook,
      createSetCellContentCommand(sheet.id, { row: 0, column: 0 }, { kind: "literal", value: 2 }),
    );
    applyWorkbookCommand(
      session.workbook,
      createSetCellContentCommand(sheet.id, { row: 1, column: 0 }, { kind: "literal", value: 1 }),
    );
    applyWorkbookCommand(
      session.workbook,
      createSetCellContentCommand(sheet.id, { row: 0, column: 1 }, cellImage),
    );
    applyWorkbookCommand(
      session.workbook,
      createSortSheetRangeCommand(
        sheet.id,
        { start: { row: 0, column: 0 }, end: { row: 1, column: 1 } },
        0,
        "ascending",
      ),
    );
    expect(getCellContent(sheet, { row: 1, column: 1 })).toEqual(cellImage);
  });

  test("preserves floating images when duplicating a sheet and restoring a deleted sheet", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    applyWorkbookCommand(session.workbook, createSetFloatingImageCommand(sheet.id, image));
    const duplicate = createDuplicateSheetCommand(session.workbook, sheet.id, { id: "sheet-copy" });
    applyWorkbookCommand(session.workbook, duplicate);
    expect(session.workbook.sheets.get("sheet-copy")?.floatingImages).toEqual([image]);

    const deleteInverse = applyWorkbookCommand(
      session.workbook,
      createDeleteSheetCommand(session.workbook, sheet.id),
    );
    applyWorkbookCommand(session.workbook, deleteInverse!);
    expect(session.workbook.sheets.get(sheet.id)?.floatingImages).toEqual([image]);
  });

  test("migrates a V3 formula snapshot to V4 while retaining formula semantics and image references", () => {
    const workbook = deserializeWorkbook({
      version: 3,
      id: "formula-v3",
      activeSheetId: "sheet-1",
      dateSystem: "1904",
      sheets: [
        {
          id: "sheet-1",
          name: "Sheet1",
          cells: [
            {
              address: { row: 0, column: 0 },
              content: { kind: "error", error: createFormulaError("NA") },
            },
            {
              address: { row: 0, column: 1 },
              content: { kind: "formula", formula: { source: "=A1" } },
            },
          ],
          rowHeights: [],
          columnWidths: [],
          freezePanes: { rows: 0, columns: 0 },
          filter: null,
          mergedCells: [],
        },
      ],
    });
    const sheet = getActiveSheet(workbook);
    applyWorkbookCommand(
      workbook,
      createSetCellContentCommand(
        sheet.id,
        { row: 1, column: 0 },
        {
          kind: "image",
          image: { assetId: "asset-cell", altText: "Cell chart" },
        },
      ),
    );
    applyWorkbookCommand(workbook, createSetFloatingImageCommand(sheet.id, image));

    expect(serializeWorkbook(workbook)).toMatchObject({
      version: 4,
      dateSystem: "1904",
      sheets: [
        {
          floatingImages: [image],
          cells: expect.arrayContaining([
            {
              address: { row: 0, column: 0 },
              content: { kind: "error", error: createFormulaError("NA") },
            },
            {
              address: { row: 0, column: 1 },
              content: { kind: "formula", formula: { source: "=A1" } },
            },
            {
              address: { row: 1, column: 0 },
              content: { kind: "image", image: { assetId: "asset-cell", altText: "Cell chart" } },
            },
          ]),
        },
      ],
    });
  });
});
