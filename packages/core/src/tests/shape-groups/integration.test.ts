import { expect, test } from "vitest";
import { group, nested } from "./fixtures.js";
import {
  normalizeSheetDrawing,
  normalizeSheetDrawings,
  isFramedShapeDrawing,
  hasShapeObjectFrame,
  requireLegacySheetDrawing,
} from "../../sheet-drawings.js";
import {
  serializeWorkbook,
  deserializeWorkbook,
  serializeSheet,
  deserializeSheet,
} from "../../serialization.js";
import { getActiveSheet } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import { canEditShapeObject, canEditSheetDrawingCollection } from "../../shape-protection.js";
import { framedShapeDrawing } from "../drawings/shape-frame-fixture.js";
import { ungroupShapeRoot } from "../../shape-group-planning.js";
import { planDeleteShapeGroupNodes } from "../../shape-group-delete.js";
import { createPictureSheetMetrics } from "../../picture-axis-metrics.js";

test("owned groups are root frames, never leaf appearances or legacy placements", () => {
  const input = group();
  input.members.push(nested());
  expect(normalizeSheetDrawing(input)).toEqual(input);
  expect(hasShapeObjectFrame(input)).toBe(true);
  expect(isFramedShapeDrawing(input)).toBe(false);
  expect(() => requireLegacySheetDrawing(input)).toThrow(/canonical/);
  expect(() =>
    normalizeSheetDrawings([input, { ...framedShapeDrawing(), id: input.members[0]!.id }]),
  ).toThrow(/Duplicate/);
  const second = group("second");
  second.members[0] = input.members[0]!;
  expect(() => normalizeSheetDrawings([input, second])).toThrow(/shared|Duplicate/);
});
test("snapshot61 is selected only for an owned group and all older protocols reject it", () => {
  const session = createTestWorkbookSession(),
    sheet = getActiveSheet(session.workbook);
  sheet.drawings = [framedShapeDrawing()];
  expect(serializeWorkbook(session.workbook).version).toBe(60);
  const input = group();
  input.members.push(nested());
  sheet.drawings = [input];
  const before = serializeWorkbook(session.workbook);
  expect(before.version).toBe(61);
  expect(serializeWorkbook(deserializeWorkbook(before))).toEqual(before);
  expect(serializeSheet(deserializeSheet(serializeSheet(sheet)))).toEqual(serializeSheet(sheet));
  for (let version = 25; version < 61; version++)
    expect(() => deserializeWorkbook({ ...before, version })).toThrow(/version 61/);
});
test("group state is deep-owned and a single reversible collection transaction", () => {
  const session = createTestWorkbookSession(),
    sheet = getActiveSheet(session.workbook),
    before = serializeWorkbook(session.workbook);
  const input = group(),
    command = createSetSheetDrawingsCommand(sheet.id, [input]);
  if (input.members[0]!.kind !== "shapeGroup") input.members[0]!.text = "mutated";
  expect(executeWorkbookCommand(session, command)).toBe(true);
  expect(session.history.undoStack).toHaveLength(1);
  const after = serializeWorkbook(session.workbook);
  expect(undoWorkbookCommand(session)).toBe(true);
  expect(serializeWorkbook(session.workbook)).toEqual(before);
  expect(redoWorkbookCommand(session)).toBe(true);
  expect(serializeWorkbook(session.workbook)).toEqual(after);
  expect(executeWorkbookCommand(session, command)).toBe(false);
});
test("protected group authorization belongs to the root and cannot be changed by a leaf", () => {
  const session = createTestWorkbookSession(),
    sheet = getActiveSheet(session.workbook),
    input = group();
  input.shapeProperties = { locked: false };
  sheet.drawings = [input];
  sheet.properties.protected = true;
  sheet.protection = { editableRanges: [] };
  expect(canEditShapeObject(sheet, input)).toBe(true);
  const changed = normalizeSheetDrawing(input);
  if (changed.members[0]!.kind !== "shapeGroup") changed.members[0]!.text = "allowed";
  expect(canEditSheetDrawingCollection(sheet, [changed])).toBe(true);
  expect(executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [changed]))).toBe(
    true,
  );
  expect(canEditSheetDrawingCollection(sheet, [{ ...changed, shapeProperties: undefined }])).toBe(
    false,
  );
  expect(canEditSheetDrawingCollection(sheet, [{ ...changed, id: "new" }])).toBe(false);
  const locked = normalizeSheetDrawing(changed);
  delete locked.shapeProperties;
  sheet.drawings = [locked];
  expect(canEditShapeObject(sheet, locked)).toBe(false);
  const changedLeaf = normalizeSheetDrawing(locked);
  changedLeaf.members[0]!.shapeProperties = { locked: false };
  expect(canEditSheetDrawingCollection(sheet, [changedLeaf])).toBe(false);
});

test("owner-relative children cannot masquerade as legacy or framed root drawings", () => {
  const source = framedShapeDrawing(),
    local = {
      kind: "shape-group-local-v1",
      rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
    };
  expect(() =>
    normalizeSheetDrawing({ ...source, groupFrame: local } as unknown as typeof source),
  ).toThrow(/Owned shape children/);
  const { shapeFrame: _frame, ...appearance } = source;
  const legacy = {
    ...appearance,
    anchor: { row: 0, column: 0 },
    offsetX: 0,
    offsetY: 0,
    width: 100,
    height: 100,
    groupFrame: local,
  };
  expect(() => normalizeSheetDrawing(legacy)).toThrow(/Owned shape children/);
  const inherited = Object.assign(Object.create({ groupFrame: local }), { ...legacy });
  delete inherited.groupFrame;
  expect(() => normalizeSheetDrawing(inherited)).toThrow(/Owned shape children/);
});

test("group feature admission never executes kind accessors in versioned or standalone payloads", () => {
  const session = createTestWorkbookSession(),
    sheet = getActiveSheet(session.workbook);
  sheet.drawings = [group()];
  const snapshot = serializeWorkbook(session.workbook);
  let reads = 0;
  const accessor = { ...group() };
  Object.defineProperty(accessor, "kind", {
    enumerable: true,
    get() {
      reads++;
      return "shapeGroup";
    },
  });
  expect(() =>
    deserializeWorkbook({ ...snapshot, sheets: [{ ...snapshot.sheets[0], drawings: [accessor] }] }),
  ).toThrow(/data field/);
  expect(() => deserializeSheet({ ...serializeSheet(sheet), drawings: [accessor] })).toThrow(
    /data field/,
  );
  expect(reads).toBe(0);
});

test("protected unlocked owner permits exact existing-ID release and singleton promotion", () => {
  for (const operation of ["ungroup", "delete"] as const) {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    const input = group();
    input.shapeProperties = { locked: false, printObject: false };
    sheet.drawings = [input];
    sheet.properties.protected = true;
    sheet.protection = { editableRanges: [] };
    const before = serializeWorkbook(session.workbook),
      metrics = createPictureSheetMetrics(sheet);
    const next =
      operation === "ungroup"
        ? ungroupShapeRoot(sheet.drawings, input.id, metrics)
        : planDeleteShapeGroupNodes(sheet.drawings, [[input.id, input.members[0]!.id]], metrics);
    expect(canEditSheetDrawingCollection(sheet, next)).toBe(true);
    expect(executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, next))).toBe(
      true,
    );
    for (const root of sheet.drawings!) {
      if (!hasShapeObjectFrame(root)) throw new Error("Expected promoted root frame");
      expect(root.shapeProperties).toMatchObject({ locked: false, printObject: false });
    }
    const after = serializeWorkbook(session.workbook);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
  }
});
