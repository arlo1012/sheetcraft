import { expect, test } from "vitest";
import { createTestWorkbookSession } from "../helpers.js";
import {
  createConvertFloatingImageToCellCommand,
  createConvertCellImageToFloatingCommand,
  createSetFloatingImageCommand,
  planFloatingPictureToCell,
} from "../../commands/index.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import { getActiveSheet, getCellContent, setCellContent, setCellStyle } from "../../workbook.js";
import { serializeWorkbook } from "../../serialization.js";
import { isFramedCellImage } from "../../cell-picture-frame.js";
import { isFramedPictureObject, type FramedFloatingImage } from "../../picture-object.js";
import { groupedFixture } from "../picture-group-planning/fixture.js";
function fixture() {
  const session = createTestWorkbookSession(),
    sheet = getActiveSheet(session.workbook);
  const image: FramedFloatingImage = {
    id: "source",
    assetId: "asset",
    altText: "Description",
    altTitle: "Title",
    locked: false,
    printObject: false,
    lockAspectRatio: false,
    frame: {
      kind: "object-frame-v1",
      anchor: { mode: "fixed", x: 128, y: 48, size: { width: 90, height: 60 } },
      angleDeg: 37,
      source: { widthRatio: 2, heightRatio: 1.5, offsetXRatio: 0.2, offsetYRatio: -0.1 },
      flipHorizontal: true,
      cropShape: { preset: "rightArrow", adjustments: { adj1: 40000 } },
    },
    transform: {
      appearance: { brightness: 0.8, opacity: 0.6 },
      annotations: [
        {
          kind: "text",
          points: [{ x: 0.4, y: 0.3 }],
          color: "#123456",
          width: 0.01,
          text: "Mark",
          fontSize: 0.1,
        },
      ],
    },
  };
  sheet.floatingImages = [image];
  return { session, sheet, image };
}
test("float/cell transfers retain editable source geometry and metadata, with exact snapshot Undo/Redo", () => {
  const f = fixture(),
    plan = planFloatingPictureToCell(f.sheet, f.image.id)!;
  setCellContent(f.sheet, plan.address, { kind: "formula", formula: { source: "=1+2" } });
  const before = serializeWorkbook(f.session.workbook);
  expect(
    executeWorkbookCommand(
      f.session,
      createConvertFloatingImageToCellCommand(f.sheet.id, f.image.id, {
        expectedAddress: plan.address,
        expectedCellContent: getCellContent(f.sheet, plan.address),
      }),
    ),
  ).toBe(true);
  const content = getCellContent(f.sheet, plan.address);
  expect(content?.kind).toBe("image");
  if (content?.kind !== "image" || !isFramedCellImage(content.image))
    throw Error("Expected framed cell image");
  expect(content.image.frame).toMatchObject({
    size: { width: 90, height: 60 },
    source: f.image.frame.source,
    angleDeg: 37,
    flipHorizontal: true,
    cropShape: f.image.frame.cropShape,
  });
  expect(content.image.transform).toEqual(f.image.transform);
  expect(content.image).toMatchObject({
    locked: false,
    printObject: false,
    lockAspectRatio: false,
    altTitle: "Title",
    altText: "Description",
  });
  expect(content.image.frame).not.toHaveProperty("anchor");
  const embedded = serializeWorkbook(f.session.workbook);
  expect(embedded.version).toBe(53);
  expect(undoWorkbookCommand(f.session)).toBe(true);
  expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  expect(redoWorkbookCommand(f.session)).toBe(true);
  expect(serializeWorkbook(f.session.workbook)).toEqual(embedded);
  expect(
    executeWorkbookCommand(
      f.session,
      createConvertCellImageToFloatingCommand(f.sheet.id, plan.address, "restored", {
        width: 2,
        height: 2,
      }),
    ),
  ).toBe(true);
  const image = f.sheet.floatingImages[0]!;
  expect(isFramedPictureObject(image)).toBe(true);
  if (!isFramedPictureObject(image)) throw Error("Expected frame");
  expect(image.frame.source).toEqual(f.image.frame.source);
  expect(image.frame.angleDeg).toBe(37);
  expect(image.frame.anchor).toMatchObject({ mode: "move-only", size: { width: 90, height: 60 } });
  const floating = serializeWorkbook(f.session.workbook);
  expect(undoWorkbookCommand(f.session)).toBe(true);
  expect(serializeWorkbook(f.session.workbook)).toEqual(embedded);
  expect(redoWorkbookCommand(f.session)).toBe(true);
  expect(serializeWorkbook(f.session.workbook)).toEqual(floating);
});
test("an actual group leaf transfers alone, contracts ownership and restores every sibling in one Undo", () => {
  const f = groupedFixture(),
    before = serializeWorkbook(f.session.workbook),
    path = ["group", "a"];
  expect(() => planFloatingPictureToCell(f.sheet, "group")).toThrow(/actual picture/);
  const plan = planFloatingPictureToCell(f.sheet, "group", path)!;
  expect(plan.image.assetId).toBe("asset-a");
  expect(
    executeWorkbookCommand(
      f.session,
      createConvertFloatingImageToCellCommand(f.sheet.id, "group", { path }),
    ),
  ).toBe(true);
  expect(f.sheet.floatingImages.map((x) => x.id)).toEqual(["middle", "b"]);
  const after = serializeWorkbook(f.session.workbook);
  expect(getCellContent(f.sheet, plan.address)?.kind).toBe("image");
  expect(undoWorkbookCommand(f.session)).toBe(true);
  expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  expect(redoWorkbookCommand(f.session)).toBe(true);
  expect(serializeWorkbook(f.session.workbook)).toEqual(after);
});
test("confirmation leases reject changed content or a relocated target before touching pictures/history", () => {
  const f = fixture(),
    plan = planFloatingPictureToCell(f.sheet, f.image.id)!;
  const command = createConvertFloatingImageToCellCommand(f.sheet.id, f.image.id, {
    expectedAddress: plan.address,
    expectedCellContent: null,
  });
  setCellContent(f.sheet, plan.address, { kind: "literal", value: "new" });
  const before = serializeWorkbook(f.session.workbook);
  expect(() => executeWorkbookCommand(f.session, command)).toThrow(/changed after confirmation/);
  expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  expect(f.session.history.undoStack).toHaveLength(0);
  setCellContent(f.sheet, plan.address, null);
  f.image.frame.anchor = { mode: "fixed", x: 640, y: 480, size: { width: 90, height: 60 } };
  const moved = serializeWorkbook(f.session.workbook);
  expect(() => executeWorkbookCommand(f.session, command)).toThrow(/destination changed/);
  expect(serializeWorkbook(f.session.workbook)).toEqual(moved);
});
test.each(["locked-source", "locked-target", "unlocked-transfer"] as const)(
  "protected %s uses actual object and cell permissions",
  (mode) => {
    const f = fixture(),
      plan = planFloatingPictureToCell(f.sheet, f.image.id)!;
    if (mode === "locked-source") delete f.image.locked;
    if (mode !== "locked-target") setCellStyle(f.sheet, plan.address, { unlocked: true });
    f.sheet.properties.protected = true;
    f.sheet.protection = { editableRanges: [] };
    const before = serializeWorkbook(f.session.workbook);
    if (mode !== "unlocked-transfer") {
      expect(() =>
        executeWorkbookCommand(
          f.session,
          createConvertFloatingImageToCellCommand(f.sheet.id, f.image.id),
        ),
      ).toThrow(/protected/);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      return;
    }
    expect(
      executeWorkbookCommand(
        f.session,
        createConvertFloatingImageToCellCommand(f.sheet.id, f.image.id),
      ),
    ).toBe(true);
    expect(
      executeWorkbookCommand(
        f.session,
        createConvertCellImageToFloatingCommand(f.sheet.id, plan.address, "return", {
          width: 10,
          height: 10,
        }),
      ),
    ).toBe(true);
    const returned = f.sheet.floatingImages[0]!;
    expect(returned.locked).toBe(false);
    expect(() =>
      executeWorkbookCommand(
        f.session,
        createSetFloatingImageCommand(f.sheet.id, { ...returned, id: "copied" }),
      ),
    ).toThrow(/protected/);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  },
);
test("conversion does not masquerade as blank under enabled data validation", () => {
  const f = fixture(),
    plan = planFloatingPictureToCell(f.sheet, f.image.id)!;
  f.sheet.dataValidations = [
    {
      id: "validation",
      range: { start: plan.address, end: plan.address },
      type: "whole",
      operator: "between",
      formula1: "1",
      formula2: "9",
      allowBlank: true,
    },
  ];
  const before = serializeWorkbook(f.session.workbook);
  expect(() =>
    executeWorkbookCommand(
      f.session,
      createConvertFloatingImageToCellCommand(f.sheet.id, f.image.id),
    ),
  ).toThrow(/validation/);
  expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  expect(f.session.history.undoStack).toHaveLength(0);
});

test("derived oversized move-and-size geometry survives both conversions without manual-size clamping", () => {
  const f = fixture();
  f.image.frame.anchor = {
    mode: "move-and-size",
    start: { column: { index: 0, offset: 0 }, row: { index: 0, offset: 0 } },
    end: { column: { index: 400, offset: 0 }, row: { index: 2, offset: 0 } },
  };
  const plan = planFloatingPictureToCell(f.sheet, f.image.id)!;
  expect(
    executeWorkbookCommand(
      f.session,
      createConvertFloatingImageToCellCommand(f.sheet.id, f.image.id),
    ),
  ).toBe(true);
  expect(
    executeWorkbookCommand(
      f.session,
      createConvertCellImageToFloatingCommand(f.sheet.id, plan.address, "back", {
        width: 2,
        height: 2,
      }),
    ),
  ).toBe(true);
  const back = f.sheet.floatingImages[0]!;
  if (!isFramedPictureObject(back)) throw Error("Expected frame");
  expect(back.frame.anchor.mode).toBe("move-and-size");
  expect(plan.image.frame?.size.width).toBeGreaterThan(10000);
});

test.each([true, false])(
  "legacy explicit aspect lock %s survives a source-bearing transfer",
  (lockAspectRatio) => {
    const f = fixture();
    f.sheet.floatingImages = [
      {
        id: "source",
        assetId: "legacy",
        altText: "legacy",
        anchor: { row: 2, column: 3 },
        offsetX: 4,
        offsetY: 5,
        width: 90,
        height: 60,
        lockAspectRatio,
        transform: {
          rotation: 90,
          crop: { x: 0.1, y: 0.2, width: 0.7, height: 0.6 },
          flipHorizontal: true,
          appearance: { opacity: 0.7 },
        },
      },
    ];
    const plan = planFloatingPictureToCell(f.sheet, "source")!;
    expect(isFramedCellImage(plan.image)).toBe(true);
    expect(plan.image).toMatchObject({
      lockAspectRatio,
      frame: { angleDeg: 90, flipHorizontal: true },
      transform: { appearance: { opacity: 0.7 } },
    });
    expect(
      executeWorkbookCommand(
        f.session,
        createConvertFloatingImageToCellCommand(f.sheet.id, "source"),
      ),
    ).toBe(true);
    expect(
      executeWorkbookCommand(
        f.session,
        createConvertCellImageToFloatingCommand(f.sheet.id, plan.address, "restored", {
          width: 10,
          height: 10,
        }),
      ),
    ).toBe(true);
    expect(f.sheet.floatingImages[0]).toMatchObject({
      lockAspectRatio,
      frame: { angleDeg: 90, source: isFramedCellImage(plan.image) ? plan.image.frame.source : {} },
    });
  },
);
test.each(["root", "leaf", "ancestor"])(
  "hidden %s conversion rejects without data loss",
  (kind) => {
    const f = fixture();
    let path: string[] | undefined;
    if (kind === "root") f.image.hidden = true;
    else {
      const { group: root } = groupedFixture();
      const first = root.members[0]!;
      root.hidden = kind === "ancestor";
      first.hidden = kind === "leaf";
      f.sheet.floatingImages = [root];
      path = [root.id, first.id];
    }
    const id = path?.[0] ?? f.image.id,
      before = serializeWorkbook(f.session.workbook);
    expect(() =>
      executeWorkbookCommand(
        f.session,
        createConvertFloatingImageToCellCommand(f.sheet.id, id, { path }),
      ),
    ).toThrow();
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
  },
);
