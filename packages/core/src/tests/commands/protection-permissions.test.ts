import { describe, expect, test } from "vitest";
import { createTestWorkbookSession } from "../helpers.js";
import { createProtectionPassword } from "../../protection-password.js";
import { canEditCell, unlockEditableRange } from "../../protection.js";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { getActiveSheet, getCellValue } from "../../workbook.js";
import {
  createApplyCellStyleCommand,
  createSetCellContentCommand,
  createSetSheetProtectionCommand,
  createSetWorkbookStructureProtectionCommand,
} from "../../commands/index.js";
import {
  createSetSheetFilterCommand,
  createClearSheetFilterCommand,
} from "../../commands/filter.js";
import { createSortSheetRangeCommand } from "../../commands/sort.js";
import {
  createSetFloatingImageCommand,
  createDeleteFloatingImageCommand,
} from "../../commands/images.js";

const a1 = { row: 0, column: 0 },
  a2 = { row: 1, column: 0 };
const range = (start = a1, end = start) => ({ start, end });
const password = "private-test-password";
const verifier = () => createProtectionPassword(password, new Uint8Array(16).fill(7), 2);
function fixture() {
  const session = createTestWorkbookSession(),
    workbook = session.workbook,
    sheet = getActiveSheet(workbook);
  const run = (command: Parameters<typeof executeWorkbookCommand>[1]) =>
    executeWorkbookCommand(session, command);
  return { session, workbook, sheet, run };
}

describe("password protected commands and permission exceptions", () => {
  test.each(["sheet", "workbook"] as const)(
    "rejects a wrong %s password atomically and replays verified removal without plaintext",
    (scope) => {
      const f = fixture();
      f.run(
        scope === "sheet"
          ? createSetSheetProtectionCommand(f.sheet.id, true, {
              editableRanges: [],
              password: verifier(),
            })
          : createSetWorkbookStructureProtectionCommand(true, verifier()),
      );
      const snapshot = serializeWorkbook(f.workbook),
        history = JSON.stringify(f.session.history);
      const remove = (supplied: string) =>
        scope === "sheet"
          ? createSetSheetProtectionCommand(f.sheet.id, false, undefined, supplied)
          : createSetWorkbookStructureProtectionCommand(false, undefined, supplied);
      expect(() => f.run(remove("wrong"))).toThrow();
      expect(serializeWorkbook(f.workbook)).toEqual(snapshot);
      expect(JSON.stringify(f.session.history)).toBe(history);
      f.run(remove(password));
      const protectedState = () =>
        scope === "sheet" ? f.sheet.properties.protected : f.workbook.structureProtected;
      expect(protectedState()).toBe(false);
      expect(JSON.stringify(f.session.history)).not.toContain(password);
      undoWorkbookCommand(f.session);
      expect(protectedState()).toBe(true);
      expect(JSON.stringify(f.session.history)).not.toContain(password);
      redoWorkbookCommand(f.session);
      expect(protectedState()).toBe(false);
      expect(JSON.stringify(f.session.history)).not.toContain(password);
    },
  );

  test("autoFilter permits criteria changes on an existing filter but rejects add, remove and resize", () => {
    const f = fixture(),
      filterRange = range(a1, { row: 2, column: 0 });
    f.run(createSetSheetFilterCommand(f.sheet.id, { range: filterRange, columns: [] }));
    f.run(
      createSetSheetProtectionCommand(f.sheet.id, true, { editableRanges: [], autoFilter: true }),
    );
    f.run(
      createSetSheetFilterCommand(f.sheet.id, {
        range: filterRange,
        columns: [{ column: 0, allowedValues: [{ kind: "string", value: "yes" }] }],
      }),
    );
    expect(f.sheet.filter?.columns[0]?.allowedValues).toEqual([{ kind: "string", value: "yes" }]);
    const before = serializeWorkbook(f.workbook),
      revision = f.session.history.revision;
    expect(() => f.run(createClearSheetFilterCommand(f.sheet.id))).toThrow();
    expect(() =>
      f.run(
        createSetSheetFilterCommand(f.sheet.id, {
          range: range(a1, { row: 3, column: 0 }),
          columns: [],
        }),
      ),
    ).toThrow();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(f.session.history.revision).toBe(revision);
    const fresh = fixture();
    fresh.run(
      createSetSheetProtectionCommand(fresh.sheet.id, true, {
        editableRanges: [],
        autoFilter: true,
      }),
    );
    expect(() =>
      fresh.run(createSetSheetFilterCommand(fresh.sheet.id, { range: filterRange, columns: [] })),
    ).toThrow();
    expect(fresh.sheet.filter).toBeNull();
  });

  test("sorting requires both permission and a wholly editable data range", () => {
    const f = fixture();
    f.run(createSetCellContentCommand(f.sheet.id, a1, { kind: "literal", value: 2 }));
    f.run(createSetCellContentCommand(f.sheet.id, a2, { kind: "literal", value: 1 }));
    f.run(createApplyCellStyleCommand(f.sheet.id, range(a1, a2), { unlocked: true }));
    f.run(createSetSheetProtectionCommand(f.sheet.id, true));
    expect(() => f.run(createSortSheetRangeCommand(f.sheet.id, range(a1, a2), 0))).toThrow();
    f.run(createSetSheetProtectionCommand(f.sheet.id, true, { editableRanges: [], sort: true }));
    const before = serializeWorkbook(f.workbook);
    expect(() =>
      f.run(createSortSheetRangeCommand(f.sheet.id, range(a1, { row: 2, column: 0 }), 0)),
    ).toThrow();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    f.run(createSortSheetRangeCommand(f.sheet.id, range(a1, a2), 0));
    expect([getCellValue(f.sheet, a1), getCellValue(f.sheet, a2)]).toEqual([1, 2]);
    undoWorkbookCommand(f.session);
    expect([getCellValue(f.sheet, a1), getCellValue(f.sheet, a2)]).toEqual([2, 1]);
  });

  test("object permission controls image insertion and deletion independently of locked cells", () => {
    const f = fixture(),
      image = {
        id: "object",
        assetId: "asset",
        altText: "",
        anchor: a1,
        offsetX: 0,
        offsetY: 0,
        width: 80,
        height: 60,
      };
    f.run(createSetSheetProtectionCommand(f.sheet.id, true));
    expect(() => f.run(createSetFloatingImageCommand(f.sheet.id, image))).toThrow();
    f.run(
      createSetSheetProtectionCommand(f.sheet.id, true, { editableRanges: [], editObjects: true }),
    );
    f.run(createSetFloatingImageCommand(f.sheet.id, image));
    expect(f.sheet.floatingImages).toHaveLength(1);
    expect(canEditCell(f.sheet, a1)).toBe(false);
    f.run(createSetSheetProtectionCommand(f.sheet.id, true));
    expect(() => f.run(createDeleteFloatingImageCommand(f.sheet.id, image.id))).toThrow();
    f.run(
      createSetSheetProtectionCommand(f.sheet.id, true, { editableRanges: [], editObjects: true }),
    );
    f.run(createDeleteFloatingImageCommand(f.sheet.id, image.id));
    expect(f.sheet.floatingImages).toHaveLength(0);
    undoWorkbookCommand(f.session);
    expect(f.sheet.floatingImages).toHaveLength(1);
  });

  test("editable range access is temporary, verified, absent from snapshots and reset by changed settings", () => {
    const f = fixture();
    f.run(
      createSetSheetProtectionCommand(f.sheet.id, true, {
        editableRanges: [{ name: "Input", range: range(a1), password: verifier() }],
      }),
    );
    const snapshot = serializeWorkbook(f.workbook),
      revision = f.session.history.revision;
    expect(canEditCell(f.sheet, a1)).toBe(false);
    expect(unlockEditableRange(f.sheet, "Input", "wrong")).toBe(false);
    expect(canEditCell(f.sheet, a1)).toBe(false);
    expect(unlockEditableRange(f.sheet, "Input", password)).toBe(true);
    expect(canEditCell(f.sheet, a1)).toBe(true);
    expect(f.session.history.revision).toBe(revision);
    expect(serializeWorkbook(f.workbook)).toEqual(snapshot);
    expect(JSON.stringify(f.sheet.protectionAccess)).not.toContain(password);
    expect(canEditCell(getActiveSheet(deserializeWorkbook(snapshot)), a1)).toBe(false);
    f.run(createSetCellContentCommand(f.sheet.id, a1, { kind: "literal", value: "allowed" }));
    f.run(
      createSetSheetProtectionCommand(f.sheet.id, true, {
        ...f.sheet.protection!,
        formatRows: true,
      }),
    );
    expect(canEditCell(f.sheet, a1)).toBe(false);
  });
});
