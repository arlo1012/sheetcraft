import { describe, expect, test, vi } from "vitest";
import {
  applyReplaceSheetDrawingCollectionsCommand,
  createReplaceSheetDrawingCollectionsCommand,
} from "../../commands/drawings.js";
import { applyWorkbookCommand } from "../../commands/apply.js";
import type { ReplaceSheetDrawingCollectionsCommand } from "../../commands/contracts.js";
import {
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
  type WorkbookSession,
} from "../../history.js";
import {
  normalizeSheetDrawings,
  requireLegacySheetDrawing,
  type SheetDrawing,
} from "../../sheet-drawings.js";
import { serializeWorkbook } from "../../serialization.js";
import { createSheet, getActiveSheet, setCellValue, type Sheet } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { framedShapeDrawing } from "./shape-frame-fixture.js";
import { legacyShapeDrawing } from "./shape-style-fixture.js";
import { ownedBox } from "../text-box-references/fixtures.js";
import { group, leaf } from "../shape-groups/fixtures.js";

function fixture() {
  const session = createTestWorkbookSession();
  const source = getActiveSheet(session.workbook);
  const target = createSheet("Target", "target");
  session.workbook.sheets.set(target.id, target);
  source.drawings = normalizeSheetDrawings([
    ownedBox(source.id),
    { ...framedShapeDrawing(), id: "retained" },
  ]);
  target.drawings = normalizeSheetDrawings([{ ...legacyShapeDrawing(), id: "target-existing" }]);
  setCellValue(source, { row: 1, column: 1 }, "source value");
  setCellValue(target, { row: 3, column: 4 }, "target value");
  source.rowHeights.set(1, 32);
  target.columnWidths.set(4, 150);
  const command = createReplaceSheetDrawingCollectionsCommand([
    { sheetId: source.id, expectedDrawings: source.drawings, drawings: source.drawings.slice(1) },
    {
      sheetId: target.id,
      expectedDrawings: target.drawings,
      drawings: [...target.drawings, source.drawings[0]!],
    },
  ]);
  return { session, source, target, command };
}

function observeAssignments(owner: object, keys: readonly string[]) {
  const record = owner as Record<string, unknown>;
  const writes = vi.fn();
  for (const key of keys) {
    let current = record[key];
    Object.defineProperty(owner, key, {
      enumerable: true,
      configurable: true,
      get: () => current,
      set: (next: unknown) => {
        writes(key);
        current = next;
      },
    });
  }
  return writes;
}

function expectAtomicFailure(
  session: WorkbookSession,
  source: Sheet,
  target: Sheet,
  action: () => unknown,
  message?: RegExp,
) {
  const workbookBefore = serializeWorkbook(session.workbook);
  const historyBefore = structuredClone(session.history);
  const sheetFields = [
    "drawings",
    "cells",
    "rowHeights",
    "columnWidths",
    "hiddenRows",
    "hiddenColumns",
    "defaultColumnWidth",
  ];
  const sourceWrites = observeAssignments(source, sheetFields);
  const targetWrites = observeAssignments(target, sheetFields);
  const historyWrites = observeAssignments(session.history, ["undoStack", "redoStack", "revision"]);
  const undoPush = vi.spyOn(session.history.undoStack, "push");
  const redoSplice = vi.spyOn(session.history.redoStack, "splice");
  expect(action).toThrow(message);
  expect(sourceWrites).not.toHaveBeenCalled();
  expect(targetWrites).not.toHaveBeenCalled();
  expect(historyWrites).not.toHaveBeenCalled();
  expect(undoPush).not.toHaveBeenCalled();
  expect(redoSplice).not.toHaveBeenCalled();
  undoPush.mockRestore();
  redoSplice.mockRestore();
  expect(serializeWorkbook(session.workbook)).toEqual(workbookBefore);
  expect(session.history).toEqual(historyBefore);
}

function rawCommand(collections: unknown): ReplaceSheetDrawingCollectionsCommand {
  return {
    type: "replaceSheetDrawingCollections",
    collections,
  } as ReplaceSheetDrawingCollectionsCommand;
}

function leafDrawing(drawing: SheetDrawing) {
  if (drawing.kind === "shapeGroup") throw new Error("Expected a leaf drawing.");
  return drawing;
}

function groupDrawing(drawing: SheetDrawing) {
  if (drawing.kind !== "shapeGroup") throw new Error("Expected a group drawing.");
  return drawing;
}

describe("bounded two-sheet drawing replacement", () => {
  test("moves exact complete forests with one history entry, undo and redo", () => {
    const { session, source, target, command } = fixture();
    const before = serializeWorkbook(session.workbook);
    const sourceBefore = structuredClone(source.drawings);
    const targetBefore = structuredClone(target.drawings);
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(session.history.undoStack).toHaveLength(1);
    expect(session.history.undoStack[0]!.operation).toBe("images.floating.set");
    const inverse = session.history.undoStack[0]!.command as ReplaceSheetDrawingCollectionsCommand;
    expect(inverse.type).toBe("replaceSheetDrawingCollections");
    expect(inverse.collections.map((entry) => entry.expectedDrawings)).toEqual(
      command.collections.map((entry) => entry.drawings),
    );
    expect(inverse.collections.map((entry) => entry.drawings)).toEqual([
      sourceBefore,
      targetBefore,
    ]);
    expect(source.drawings).toEqual(command.collections[0].drawings);
    expect(target.drawings).toEqual(command.collections[1].drawings);
    const after = serializeWorkbook(session.workbook);
    expect(JSON.stringify(after)).not.toContain("replaceSheetDrawingCollections");
    expect(after.version).toBe(before.version);
    expect(after.sheets.map(({ drawings: _drawings, ...sheet }) => sheet)).toEqual(
      before.sheets.map(({ drawings: _drawings, ...sheet }) => sheet),
    );
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(session.history.undoStack).toHaveLength(0);
    expect(session.history.redoStack).toHaveLength(1);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
    expect(session.history.undoStack).toHaveLength(1);
    expect(session.history.redoStack).toHaveLength(0);
  });

  test("detaches caller data and compares complete canonical expected forests", () => {
    const { session, source, target } = fixture();
    const original = framedShapeDrawing();
    source.drawings = [{ ...original, hidden: false } as unknown as SheetDrawing];
    const sourceExpected = [
      { ...original, shapeProperties: { locked: true } } as unknown as SheetDrawing,
    ];
    const inputs = [
      { sheetId: source.id, expectedDrawings: sourceExpected, drawings: [] },
      { sheetId: target.id, expectedDrawings: target.drawings!.slice(), drawings: [original] },
    ];
    const command = createReplaceSheetDrawingCollectionsCommand(inputs);
    original.text = "caller changed";
    leafDrawing(sourceExpected[0]!).text = "caller changed";
    inputs[1]!.expectedDrawings.splice(0);
    expect(executeWorkbookCommand(session, command)).toBe(true);
    leafDrawing(command.collections[1].drawings[0]!).text = "command changed";
    expect(leafDrawing(target.drawings![0]!).text).not.toBe("command changed");
  });

  test("preserves every unrelated legacy drawing kind in the complete forest", () => {
    const { session, source, target } = fixture();
    const base = legacyShapeDrawing();
    const legacy: SheetDrawing[] = [
      ...(["icon", "equation", "wordArt", "textBox"] as const).map((kind) => ({
        ...base,
        id: kind,
        kind,
      })),
      {
        ...base,
        id: "chart",
        kind: "chart",
        chart: {
          type: "column",
          range: null,
          title: "Chart",
          headerRow: false,
          headerColumn: false,
          seriesBy: "columns",
          legend: true,
          labels: false,
          stacked: false,
          showHidden: false,
        },
      },
      { ...base, id: "camera", kind: "camera", camera: { range: null, gridLines: true } },
      {
        ...base,
        id: "attachment",
        kind: "attachment",
        attachment: {
          filename: "file.txt",
          mimeType: "text/plain",
          size: 0,
          data: "",
          display: "icon",
        },
      },
      {
        ...base,
        id: "control",
        kind: "control",
        control: {
          type: "checkbox",
          label: "Control",
          linkedCell: null,
          source: null,
          items: [],
          min: 0,
          max: 10,
          step: 1,
          optionValue: 1,
          resetValue: null,
        },
      },
    ];
    source.drawings = normalizeSheetDrawings([source.drawings![0]!, ...legacy]);
    const before = serializeWorkbook(session.workbook);
    const command = createReplaceSheetDrawingCollectionsCommand([
      { sheetId: source.id, expectedDrawings: source.drawings, drawings: source.drawings.slice(1) },
      {
        sheetId: target.id,
        expectedDrawings: target.drawings!,
        drawings: [...target.drawings!, source.drawings[0]!],
      },
    ]);
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(source.drawings).toEqual(normalizeSheetDrawings(legacy));
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
  });

  test("returns null only when both full forests are unchanged", () => {
    const { session, source, target } = fixture();
    const command = createReplaceSheetDrawingCollectionsCommand(
      [source, target].map((sheet) => ({
        sheetId: sheet.id,
        expectedDrawings: sheet.drawings!,
        drawings: sheet.drawings!,
      })),
    );
    expect(applyReplaceSheetDrawingCollectionsCommand(session.workbook, command)).toBeNull();
    expect(executeWorkbookCommand(session, command)).toBe(false);
    expect(session.history.undoStack).toHaveLength(0);
    leafDrawing(command.collections[1].drawings[0]!).text = "one sheet changed";
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(session)).toBe(true);
  });

  test.each([0, 1])(
    "stale whole-forest CAS on sheet %s leaves both sheets and history untouched",
    (index) => {
      const { session, source, target, command } = fixture();
      command.collections[index]!.expectedDrawings[0]!.name = "stale expected name";
      expectAtomicFailure(
        session,
        source,
        target,
        () => executeWorkbookCommand(session, command),
        /changed after/,
      );
    },
  );

  test.each([0, 1])(
    "checks derived geometry for sheet %s before either collection write",
    (index) => {
      const { session, source, target, command } = fixture();
      const sheet = index === 0 ? source : target;
      sheet.defaultColumnWidth = 640;
      const oversized = framedShapeDrawing({
        mode: "move-and-size",
        start: { row: { index: 0, offset: 0 }, column: { index: 0, offset: 0 } },
        end: { row: { index: 1, offset: 0 }, column: { index: 100, offset: 0 } },
      });
      oversized.id = "oversized";
      command.collections[index]!.drawings.push(oversized);
      expectAtomicFailure(
        session,
        source,
        target,
        () => executeWorkbookCommand(session, command),
        /16384/,
      );
    },
  );

  test("missing sheets and duplicate IDs fail without a source deletion", () => {
    for (const targetId of ["missing", "duplicate"]) {
      const { session, source, target, command } = fixture();
      command.collections[1].sheetId = targetId === "duplicate" ? source.id : targetId;
      expectAtomicFailure(session, source, target, () => executeWorkbookCommand(session, command));
    }
  });

  test("existing unlocked source roots obey the actual collection rule", () => {
    const { session, source, target } = fixture();
    groupDrawing(source.drawings![0]!).shapeProperties = { locked: false };
    source.properties.protected = true;
    source.protection = { editableRanges: [] };
    const command = createReplaceSheetDrawingCollectionsCommand([
      {
        sheetId: source.id,
        expectedDrawings: source.drawings!,
        drawings: source.drawings!.slice(1),
      },
      {
        sheetId: target.id,
        expectedDrawings: target.drawings!,
        drawings: [...target.drawings!, source.drawings![0]!],
      },
    ]);
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(source.drawings).toHaveLength(1);
    // History restores a legitimate prior insertion even after protection changes.
    target.properties.protected = true;
    target.protection = { editableRanges: [] };
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(redoWorkbookCommand(session)).toBe(true);
  });

  test.each(["source", "target"])(
    "protected %s cannot be bypassed by incoming unlocked flags",
    (owner) => {
      const { session, source, target, command } = fixture();
      const sheet = owner === "source" ? source : target;
      sheet.properties.protected = true;
      sheet.protection = { editableRanges: [] };
      groupDrawing(command.collections[1].drawings.at(-1)!).shapeProperties = { locked: false };
      expectAtomicFailure(
        session,
        source,
        target,
        () => executeWorkbookCommand(session, command),
        /protected/,
      );
    },
  );

  test("an unlocked child cannot authorize cutting a locked outer owner", () => {
    const { session, source, target } = fixture();
    const group = source.drawings![0]!;
    if (group.kind !== "shapeGroup") throw new Error("Expected group.");
    group.members[0]!.shapeProperties = { locked: false };
    source.properties.protected = true;
    source.protection = { editableRanges: [] };
    const command = createReplaceSheetDrawingCollectionsCommand([
      {
        sheetId: source.id,
        expectedDrawings: source.drawings!,
        drawings: source.drawings!.slice(1),
      },
      {
        sheetId: target.id,
        expectedDrawings: target.drawings!,
        drawings: [...target.drawings!, group],
      },
    ]);
    expectAtomicFailure(
      session,
      source,
      target,
      () => executeWorkbookCommand(session, command),
      /protected/,
    );
  });

  test("Edit objects permission is independently honored for both sheets", () => {
    const { session, source, target, command } = fixture();
    for (const sheet of [source, target]) {
      sheet.properties.protected = true;
      sheet.protection = { editableRanges: [], editObjects: true };
    }
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(undoWorkbookCommand(session)).toBe(true);
  });

  test("invalid second history forest is normalized before the first restore writes", () => {
    const { session, source, target, command } = fixture();
    executeWorkbookCommand(session, command);
    const inverse = session.history.undoStack[0]!.command as ReplaceSheetDrawingCollectionsCommand;
    leafDrawing(inverse.collections[1].drawings[0]!).fontSize = Infinity;
    expectAtomicFailure(session, source, target, () => undoWorkbookCommand(session));
  });

  test("history still checks both expected forests and derived target geometry", () => {
    for (const issue of ["stale", "geometry"]) {
      const { session, source, target, command } = fixture();
      executeWorkbookCommand(session, command);
      const inverse = session.history.undoStack[0]!
        .command as ReplaceSheetDrawingCollectionsCommand;
      if (issue === "stale") inverse.collections[1].expectedDrawings[0]!.name = "stale";
      else
        inverse.collections[1].drawings.push(
          framedShapeDrawing({
            mode: "move-and-size",
            start: { row: { index: 0, offset: 0 }, column: { index: 0, offset: 0 } },
            end: { row: { index: 1, offset: 0 }, column: { index: 200, offset: 0 } },
          }),
        );
      expectAtomicFailure(session, source, target, () => undoWorkbookCommand(session));
    }
  });
});

describe("drawing replacement own-data admission", () => {
  test("counts group descendants and unrelated standalone roots in one forest budget", () => {
    const { session, source, target, command } = fixture();
    const child = leaf();
    const largeGroup = {
      ...group("large"),
      members: Array.from({ length: 9_998 }, (_, index) => ({ ...child, id: `child-${index}` })),
    };
    command.collections[1].drawings = [
      largeGroup,
      { ...legacyShapeDrawing(), id: "standalone-a" },
      { ...legacyShapeDrawing(), id: "standalone-b" },
    ];
    expectAtomicFailure(
      session,
      source,
      target,
      () => executeWorkbookCommand(session, command),
      /forest node budget/,
    );
  });

  test.each([
    ["expectedDrawings", undefined],
    ["expectedDrawings", null],
    ["drawings", undefined],
    ["drawings", null],
  ])("requires explicit %s forest data %#", (field, value) => {
    const { session, source, target, command } = fixture();
    Object.defineProperty(command.collections[1], String(field), { value });
    expectAtomicFailure(session, source, target, () => executeWorkbookCommand(session, command));
  });

  test.each([undefined, null, [], [{}], [{}, {}, {}], Object.assign([], { length: 2 })])(
    "rejects malformed collection arrays %#",
    (collections) => {
      const { session, source, target } = fixture();
      expectAtomicFailure(session, source, target, () =>
        executeWorkbookCommand(session, rawCommand(collections)),
      );
    },
  );

  test.each(["", "  ", "x".repeat(1025), 12, null])(
    "rejects invalid bounded sheet identities %#",
    (sheetId) => {
      const { session, source, target, command } = fixture();
      (command.collections[1] as unknown as { sheetId: unknown }).sheetId = sheetId;
      expectAtomicFailure(session, source, target, () => executeWorkbookCommand(session, command));
    },
  );

  test.each(["command", "entry", "root", "nested"])(
    "rejects inherited %s records without reading inherited getters",
    (location) => {
      const { session, source, target, command } = fixture();
      let reads = 0;
      const prototype = Object.defineProperty({}, "ignored", {
        get: () => {
          reads++;
          return 1;
        },
      });
      const record =
        location === "command"
          ? command
          : location === "entry"
            ? command.collections[1]
            : location === "root"
              ? command.collections[1].drawings[0]!
              : requireLegacySheetDrawing(command.collections[1].drawings[0]!).anchor;
      Object.setPrototypeOf(record, prototype);
      expectAtomicFailure(session, source, target, () => executeWorkbookCommand(session, command));
      expect(reads).toBe(0);
    },
  );

  test.each(["type", "collections", "sheetId", "expectedDrawings", "drawings", "name", "row"])(
    "never evaluates incoming %s accessors",
    (field) => {
      const { session, source, target, command } = fixture();
      let reads = 0;
      const record =
        field === "type" || field === "collections"
          ? command
          : ["sheetId", "expectedDrawings", "drawings"].includes(field)
            ? command.collections[1]
            : field === "row"
              ? requireLegacySheetDrawing(command.collections[1].drawings[0]!).anchor
              : command.collections[1].drawings[0]!;
      Object.defineProperty(record, field, {
        configurable: true,
        get: () => {
          reads++;
          throw new Error("getter executed");
        },
      });
      expectAtomicFailure(session, source, target, () => executeWorkbookCommand(session, command));
      expect(reads).toBe(0);
    },
  );

  test.each(["sparse", "accessor", "prototype", "extra", "oversized"])(
    "rejects malformed %s forest arrays without invoking their data",
    (issue) => {
      const { session, source, target, command } = fixture();
      let reads = 0;
      const drawings = command.collections[1].drawings;
      if (issue === "sparse") delete drawings[0];
      if (issue === "accessor")
        Object.defineProperty(drawings, "0", {
          get: () => {
            reads++;
            return undefined;
          },
        });
      if (issue === "prototype") Object.setPrototypeOf(drawings, Object.create(Array.prototype));
      if (issue === "extra")
        Object.defineProperty(drawings, "map", {
          value: () => {
            reads++;
            return [];
          },
        });
      if (issue === "oversized") drawings.length = 10_001;
      expectAtomicFailure(session, source, target, () => executeWorkbookCommand(session, command));
      expect(reads).toBe(0);
    },
  );

  test.each(["command", "entry", "root", "anchor"])(
    "rejects unknown %s data fields",
    (location) => {
      const { session, source, target, command } = fixture();
      const record =
        location === "command"
          ? command
          : location === "entry"
            ? command.collections[1]
            : location === "root"
              ? command.collections[1].drawings[0]!
              : requireLegacySheetDrawing(command.collections[1].drawings[0]!).anchor;
      Object.defineProperty(record, "externalDrawingCollections", { value: [] });
      expectAtomicFailure(session, source, target, () => executeWorkbookCommand(session, command));
    },
  );

  test.each(["members", "chart", "camera", "attachment", "control"])(
    "rejects conflicting known %s payloads on a legacy shape",
    (field) => {
      const { session, source, target, command } = fixture();
      Object.defineProperty(command.collections[1].drawings[0]!, field, { value: [] });
      expectAtomicFailure(
        session,
        source,
        target,
        () => executeWorkbookCommand(session, command),
        /does not belong/,
      );
    },
  );

  test("history validation rejects getters in either forest without skipping malformed data", () => {
    const { session, source, target, command } = fixture();
    let reads = 0;
    Object.defineProperty(command.collections[1], "drawings", {
      get: () => {
        reads++;
        return [];
      },
    });
    expectAtomicFailure(session, source, target, () =>
      applyWorkbookCommand(session.workbook, command, { fromHistory: true }),
    );
    expect(reads).toBe(0);
  });
});
