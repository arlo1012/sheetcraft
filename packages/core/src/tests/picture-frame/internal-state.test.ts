import type { CellContent } from "../../formula/types.js";
import { describe, expect, test } from "vitest";
import { createTestWorkbookSession } from "../helpers.js";
import {
  getActiveSheet,
  cloneFloatingImage,
  cloneCellContent,
  setCellContent,
  type LegacyFloatingImage,
} from "../../workbook.js";
import { type FramedFloatingImage, isFramedPictureObject } from "../../picture-object.js";
import { getPictureObjectOriginCell } from "../../picture-object-sheet.js";
import { createPictureSheetMetrics } from "../../picture-axis-metrics.js";
import {
  resolvePictureFrame,
  anchorPictureFrameRect,
  type PictureFrameAnchor,
} from "../../picture-frame.js";
import {
  serializeWorkbook,
  deserializeWorkbook,
  serializeSheet,
  deserializeSheet,
} from "../../serialization.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import {
  createSetFloatingImageCommand,
  createSetSheetFloatingImagesCommand,
  createDeleteFloatingImageCommand,
  createConvertFloatingImageToCellCommand,
  createResizeSheetDimensionCommand,
  createResizeSheetDimensionsCommand,
  createSetSheetDimensionHiddenCommand,
  createDeleteSheetAxisCommand,
  createInsertSheetAxisCommand,
  createMoveSheetAxisCommand,
  createDeleteCellsCommand,
  applyWorkbookCommand,
} from "../../commands/index.js";
function fixture(mode: PictureFrameAnchor["mode"] = "move-only") {
  const session = createTestWorkbookSession(),
    sheet = getActiveSheet(session.workbook);
  const picture: FramedFloatingImage = {
    id: "picture",
    assetId: "asset",
    altText: "Synthetic",
    frame: {
      kind: "object-frame-v1",
      anchor: anchorPictureFrameRect(
        mode,
        { x: 194, y: 74, width: 360, height: 240 },
        createPictureSheetMetrics(sheet),
      ),
      angleDeg: 37,
      source: { widthRatio: 2, heightRatio: 1.5, offsetXRatio: -0.25, offsetYRatio: 0.1 },
    },
    transform: { appearance: { brightness: 0.1 } },
  };
  return {
    session,
    sheet,
    picture,
    resolve: () =>
      resolvePictureFrame(
        (sheet.floatingImages[0]! as FramedFloatingImage).frame,
        createPictureSheetMetrics(sheet),
      ),
  };
}
describe("frame-aware internal state", () => {
  test("47 is selected only for real frames and keeps font runs in standalone inference", () => {
    const f = fixture();
    expect(serializeWorkbook(f.session.workbook).version).toBe(43);
    setCellContent(
      f.sheet,
      { row: 0, column: 0 },
      { kind: "literal", value: "ab", fontRuns: [{ start: 0, end: 1, fontFamily: "Noto Sans" }] },
    );
    expect(serializeWorkbook(f.session.workbook).version).toBe(46);
    f.sheet.floatingImages = [f.picture];
    const snapshot = serializeWorkbook(f.session.workbook);
    expect(snapshot.version).toBe(47);
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    expect(serializeSheet(deserializeSheet(serializeSheet(f.sheet)))).toEqual(
      serializeSheet(f.sheet),
    );
    expect(() => deserializeWorkbook({ ...snapshot, version: 46 })).toThrow(/version 47/);
  });
  test.each([1, 2, 3, 4, 24, 43, 44, 45, 46])(
    "a %s declaration cannot bypass frame validation by skipping its collection",
    (version) => {
      const f = fixture();
      f.sheet.floatingImages = [f.picture];
      const snapshot = serializeWorkbook(f.session.workbook);
      expect(() =>
        deserializeWorkbook({
          version,
          ...(version >= 3 ? { dateSystem: snapshot.dateSystem } : {}),
          id: snapshot.id,
          activeSheetId: snapshot.activeSheetId,
          sheets: [
            {
              id: f.sheet.id,
              name: f.sheet.name,
              cells: [],
              rowHeights: [],
              columnWidths: [],
              floatingImages: [f.picture],
            },
          ],
        }),
      ).toThrow(/version 47/);
    },
  );
  test("mixed legacy/framed command changes undo and redo one exact ordered collection", () => {
    const f = fixture();
    const legacy: LegacyFloatingImage = {
      id: "legacy",
      assetId: "asset",
      altText: "",
      anchor: { row: 1, column: 1 },
      offsetX: 100,
      offsetY: 2,
      width: 120,
      height: 60,
      transform: { rotation: 90 },
    };
    f.sheet.floatingImages = [legacy];
    const before = serializeWorkbook(f.session.workbook);
    expect(
      executeWorkbookCommand(
        f.session,
        createSetSheetFloatingImagesCommand(f.sheet.id, [legacy, f.picture]),
      ),
    ).toBe(true);
    const after = serializeWorkbook(f.session.workbook);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(after);
    const copy = cloneFloatingImage(f.picture);
    copy.frame.source.offsetXRatio = 1;
    expect(f.picture.frame.source.offsetXRatio).toBe(-0.25);
    expect(
      executeWorkbookCommand(f.session, createDeleteFloatingImageCommand(f.sheet.id, "picture")),
    ).toBe(true);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(after);
  });
  test("framed cell conversion is reversible and worksheet-anchored cell geometry is rejected", () => {
    const f = fixture();
    f.sheet.floatingImages = [f.picture];
    const before = serializeWorkbook(f.session.workbook);
    expect(
      executeWorkbookCommand(
        f.session,
        createConvertFloatingImageToCellCommand(f.sheet.id, f.picture.id),
      ),
    ).toBe(true);
    expect(serializeWorkbook(f.session.workbook).version).toBe(53);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    const content = {
      kind: "image",
      image: { assetId: "asset", altText: "", frame: f.picture.frame },
    } as unknown as CellContent;
    expect(() => setCellContent(f.sheet, { row: 0, column: 0 }, content)).toThrow(
      /cell picture|kind/i,
    );
    expect(() => cloneCellContent(content)).toThrow(/cell picture|kind/i);
    const raw = serializeSheet(f.sheet);
    raw.cells = [{ address: { row: 0, column: 0 }, content }];
    expect(() => deserializeSheet(raw)).toThrow(/cell picture|kind/i);
  });
  test.each(["fixed", "move-only", "move-and-size"] as const)(
    "%s dimensions and Undo retain exact frame geometry",
    (mode) => {
      const f = fixture(mode);
      f.sheet.floatingImages = [f.picture];
      const before = serializeWorkbook(f.session.workbook),
        original = f.resolve();
      executeWorkbookCommand(
        f.session,
        createResizeSheetDimensionCommand(f.sheet.id, "row", 1, 64),
      );
      expect(f.resolve().rect.y).toBe(original.rect.y + (mode === "fixed" ? 0 : 40));
      expect(f.resolve().rect.height).toBe(240);
      undoWorkbookCommand(f.session);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      executeWorkbookCommand(
        f.session,
        createResizeSheetDimensionCommand(f.sheet.id, "row", 3, 64),
      );
      expect(f.resolve().rect.height).toBe(mode === "move-and-size" ? 280 : 240);
      undoWorkbookCommand(f.session);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    },
  );
  test.each(["fixed", "move-only", "move-and-size"] as const)(
    "%s deleting its anchor follows its own contract and restores exactly",
    (mode) => {
      const f = fixture(mode);
      f.sheet.floatingImages = [f.picture];
      const before = serializeWorkbook(f.session.workbook);
      executeWorkbookCommand(f.session, createDeleteSheetAxisCommand(f.sheet.id, "row", 3, 1));
      expect(f.sheet.floatingImages).toHaveLength(1);
      expect(f.resolve().rect.y).toBe(mode === "fixed" ? 74 : 72);
      expect(f.resolve().rect.height).toBe(mode === "move-and-size" ? 218 : 240);
      undoWorkbookCommand(f.session);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      redoWorkbookCommand(f.session);
      expect(f.sheet.floatingImages).toHaveLength(1);
    },
  );
  test("logical full deletion removes stretch object but hide only collapses it", () => {
    const f = fixture("move-and-size");
    f.sheet.floatingImages = [f.picture];
    const before = serializeWorkbook(f.session.workbook);
    executeWorkbookCommand(
      f.session,
      createSetSheetDimensionHiddenCommand(
        f.sheet.id,
        "row",
        Array.from({ length: 12 }, (_, i) => i + 3),
        true,
      ),
    );
    expect(f.sheet.floatingImages).toHaveLength(1);
    expect(f.resolve().collapsed).toBe(true);
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    executeWorkbookCommand(f.session, createDeleteSheetAxisCommand(f.sheet.id, "row", 3, 12));
    expect(f.sheet.floatingImages).toEqual([]);
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });
  test("insertion is planned once and Undo restores source, angle and free geometry", () => {
    const f = fixture();
    f.sheet.floatingImages = [f.picture];
    const before = serializeWorkbook(f.session.workbook);
    executeWorkbookCommand(f.session, createInsertSheetAxisCommand(f.sheet.id, "column", 1, 2));
    expect(f.resolve().rect.x).toBe(386);
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });
  test("unimplemented stretch reordering and moving-picture partial shifts reject before cells/history change", () => {
    const f = fixture("move-and-size");
    f.sheet.floatingImages = [f.picture];
    setCellContent(f.sheet, { row: 3, column: 2 }, { kind: "literal", value: "keep" });
    const before = serializeWorkbook(f.session.workbook);
    for (const command of [
      createMoveSheetAxisCommand(f.sheet.id, "row", 3, 1, 8),
      createDeleteCellsCommand(
        f.sheet.id,
        { start: { row: 3, column: 2 }, end: { row: 3, column: 2 } },
        "up",
      ),
    ]) {
      expect(() => executeWorkbookCommand(f.session, command)).toThrow(/not yet supported/);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
    }
  });
  test("fixed pictures survive partial cell shifts and moving origins follow whole-axis reorder", () => {
    const f = fixture("fixed");
    f.sheet.floatingImages = [f.picture];
    const old = cloneFloatingImage(f.picture);
    executeWorkbookCommand(
      f.session,
      createDeleteCellsCommand(
        f.sheet.id,
        { start: { row: 3, column: 2 }, end: { row: 3, column: 2 } },
        "up",
      ),
    );
    expect(f.sheet.floatingImages).toEqual([old]);
    const moving = fixture();
    moving.sheet.floatingImages = [moving.picture];
    executeWorkbookCommand(
      moving.session,
      createMoveSheetAxisCommand(moving.sheet.id, "row", 3, 1, 8),
    );
    expect(getPictureObjectOriginCell(moving.sheet.floatingImages[0]!, moving.sheet).row).toBe(8);
  });
  test("invalid derived source rejects batched set and dimension changes atomically", () => {
    const f = fixture("move-and-size");
    f.sheet.floatingImages = [f.picture];
    const before = serializeWorkbook(f.session.workbook);
    const bad = cloneFloatingImage(f.picture);
    bad.id = "bad";
    bad.frame.source.widthRatio = Number.MAX_VALUE;
    expect(() =>
      executeWorkbookCommand(
        f.session,
        createSetSheetFloatingImagesCommand(f.sheet.id, [f.picture, bad]),
      ),
    ).toThrow(/finite/);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    f.picture.frame.source.heightRatio = Number.MAX_VALUE / 250;
    const safe = serializeWorkbook(f.session.workbook);
    expect(() =>
      executeWorkbookCommand(
        f.session,
        createResizeSheetDimensionsCommand(f.sheet.id, "row", [3, 4], 64),
      ),
    ).toThrow(/finite/);
    expect(serializeWorkbook(f.session.workbook)).toEqual(safe);
    expect(f.session.history.undoStack).toHaveLength(0);
  });
  test("a legacy structural inverse cannot mutate newer frame geometry or dimensions", () => {
    const f = fixture("move-and-size");
    f.sheet.rowHeights.set(4, 64);
    const inverse = applyWorkbookCommand(
      f.session.workbook,
      createDeleteSheetAxisCommand(f.sheet.id, "row", 4, 1),
    );
    if (!inverse || inverse.type !== "restoreSheetState" || !("slice" in inverse))
      throw new Error("Expected structural inverse");
    delete inverse.slice.floatingImageState;
    f.picture.frame.anchor = {
      mode: "move-and-size",
      start: { row: { index: 3, offset: 0 }, column: { index: 0, offset: 0 } },
      end: { row: { index: 6, offset: 0 }, column: { index: 1, offset: 0 } },
    };
    f.picture.frame.source.heightRatio = Number.MAX_VALUE / 120;
    f.sheet.floatingImages = [f.picture];
    const before = serializeWorkbook(f.session.workbook);
    expect(() => executeWorkbookCommand(f.session, inverse)).toThrow(/legacy structural inverse/);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(f.session.history.redoStack).toHaveLength(0);
  });
  test("frame runtime discriminator remains explicit and unknown/conflicting schema cannot be normalized away", () => {
    const f = fixture();
    expect(isFramedPictureObject(f.picture)).toBe(true);
    const raw = serializeWorkbook(f.session.workbook);
    raw.version = 47;
    raw.sheets[0]!.floatingImages = [f.picture];
    expect(() =>
      deserializeWorkbook({
        ...raw,
        sheets: [{ ...raw.sheets[0], floatingImages: [{ ...f.picture, width: undefined }] }],
      }),
    ).toThrow(/conflicting/);
    expect(() =>
      deserializeWorkbook({
        ...raw,
        sheets: [
          {
            ...raw.sheets[0],
            floatingImages: [{ ...f.picture, frame: { ...f.picture.frame, kind: "unknown" } }],
          },
        ],
      }),
    ).toThrow(/kind/);
    expect(() =>
      deserializeWorkbook({
        ...raw,
        sheets: [
          {
            ...raw.sheets[0],
            floatingImages: [
              { ...f.picture, id: "same" },
              { ...f.picture, id: "same" },
            ],
          },
        ],
      }),
    ).toThrow(/Duplicate/);
    const legacy = {
      id: "legacy",
      assetId: "asset",
      altText: "",
      anchor: { row: 0, column: 0 },
      offsetX: 0,
      offsetY: 0,
      width: 100,
      height: 50,
      transform: { rotation: 37 },
    };
    expect(() =>
      deserializeWorkbook({ ...raw, sheets: [{ ...raw.sheets[0], floatingImages: [legacy] }] }),
    ).toThrow(/rotation|Rotation/);
  });
  test("set single image validates resolved geometry before replacing the previous source", () => {
    const f = fixture();
    f.sheet.floatingImages = [f.picture];
    const before = serializeWorkbook(f.session.workbook),
      bad = cloneFloatingImage(f.picture);
    bad.frame.source.widthRatio = Number.MAX_VALUE;
    expect(() =>
      executeWorkbookCommand(f.session, createSetFloatingImageCommand(f.sheet.id, bad)),
    ).toThrow(/finite/);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });
});
