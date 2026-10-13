import { describe, expect, test, vi } from "vitest";
import { createWorkbook, createSheet, getActiveSheet } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { applyWorkbookCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { groupShapeRoots, ungroupShapeRoot } from "@sheetcraft/core/shape-group-planning";
import type { SheetDrawing } from "@sheetcraft/core/sheet-drawings";
import { useDrawingActions } from "../../../modules/sheet-drawings/useDrawingActions";
import { framedShape } from "./framed-shape-fixture";

function fixture() {
  let workbook = createWorkbook({ id: "book", sheetId: "sheet" });
  let sheet = getActiveSheet(workbook);
  sheet.drawings = [framedShape(), { ...framedShape(), id: "second" }];
  let generation = 0,
    revision = 0,
    metrics = createPictureSheetMetrics(sheet),
    busy = false;
  const prepare = vi.fn((drawing: SheetDrawing, _owner?: SheetDrawing) => drawing);
  const execute = vi.fn((command: WorkbookCommand): unknown =>
    applyWorkbookCommand(workbook, command),
  );
  const actions = useDrawingActions({
    getWorkbook: () => workbook,
    getSheet: () => sheet,
    getGeneration: () => generation,
    getRevision: () => revision,
    getMetrics: () => metrics,
    getAddress: () => ({ row: 0, column: 0 }),
    flush: () => true,
    execute,
    isBusy: () => busy,
    name: (kind) => kind,
    prepareDrawing: prepare,
  });
  return {
    actions,
    prepare,
    execute,
    get sheet() {
      return sheet;
    },
    get workbook() {
      return workbook;
    },
    get metrics() {
      return metrics;
    },
    change(kind: string) {
      if (kind === "generation") generation++;
      else if (kind === "revision") revision++;
      else if (kind === "metrics") metrics = createPictureSheetMetrics(sheet);
      else if (kind === "busy") busy = true;
      else if (kind === "order") sheet.drawings!.reverse();
      else if (kind === "same-ID") sheet.drawings![1] = { ...sheet.drawings![1]! };
      else if (kind === "append") sheet.drawings!.push({ ...framedShape(), id: "third" });
      else if (kind === "sheet") {
        sheet = createSheet("Replacement", sheet.id);
        workbook.sheets.set(sheet.id, sheet);
      } else if (kind === "membership")
        workbook.sheets.set(sheet.id, createSheet("Replacement", sheet.id));
      else if (kind === "workbook") workbook = createWorkbook({ id: "other", sheetId: sheet.id });
      else if (kind === "protection") sheet.properties.protected = true;
    },
  };
}

describe("atomic sheet drawing collection CAS", () => {
  test("prepares changed/new roots only and submits the whole forest in one command", () => {
    const f = fixture(),
      expected = [...f.sheet.drawings!];
    const changed = { ...expected[0]!, name: "Changed" },
      added = { ...framedShape(), id: "new" };
    expect(f.actions.replaceCollection([changed, expected[1]!, added], expected, f.metrics)).toBe(
      true,
    );
    expect(f.prepare.mock.calls).toEqual([
      [changed, expected[0], [changed, expected[1], added]],
      [added, undefined, [changed, expected[1], added]],
    ]);
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.execute.mock.calls[0]![0]).toMatchObject({
      type: "setSheetDrawings",
      sheetId: f.sheet.id,
    });
    expect(f.sheet.drawings!.map((item) => item.id)).toEqual(["shape", "second", "new"]);
  });
  test("canonical no-op clones skip preparation/execution and acknowledge true", () => {
    const f = fixture(),
      expected = [...f.sheet.drawings!],
      original = f.sheet.drawings;
    f.prepare.mockImplementation(() => {
      throw new Error("Must not prepare unchanged data");
    });
    expect(f.actions.replaceCollection(structuredClone(expected), expected, f.metrics)).toBe(true);
    expect(f.sheet.drawings).toBe(original);
    expect(f.prepare).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
  });
  test("order-only edits skip preflight while keeping exact root-order CAS", () => {
    const f = fixture(),
      expected = [...f.sheet.drawings!];
    expect(
      f.actions.replaceCollection([...expected].reverse(), [...expected].reverse(), f.metrics),
    ).toBe(false);
    expect(f.actions.replaceCollection([...expected].reverse(), expected, f.metrics)).toBe(true);
    expect(f.prepare).not.toHaveBeenCalled();
    expect(f.execute).toHaveBeenCalledTimes(1);
  });
  test.each([
    "generation",
    "revision",
    "metrics",
    "busy",
    "order",
    "same-ID",
    "append",
    "sheet",
    "membership",
    "workbook",
    "protection",
  ])("rejects a %s change during preparation before execution", (kind) => {
    const f = fixture(),
      expected = [...f.sheet.drawings!];
    f.prepare.mockImplementationOnce((drawing) => {
      f.change(kind);
      return drawing;
    });
    expect(
      f.actions.replaceCollection(
        [{ ...expected[0]!, name: "Changed" }, expected[1]!],
        expected,
        f.metrics,
      ),
    ).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
  });
  test("rejects preparation failure on a later root without touching the earlier one or history", () => {
    const f = fixture(),
      expected = [...f.sheet.drawings!],
      original = f.sheet.drawings;
    f.prepare
      .mockImplementationOnce((d) => d)
      .mockImplementationOnce(() => {
        throw new Error("glyph budget");
      });
    expect(
      f.actions.replaceCollection(
        expected.map((d) => ({ ...d, name: "Changed" })),
        expected,
      ),
    ).toBe(false);
    expect(f.sheet.drawings).toBe(original);
    expect(f.sheet.drawings).toEqual(expected);
    expect(f.execute).not.toHaveBeenCalled();
  });
  test("validates duplicate roots and shared subtree ownership before preparing anything", () => {
    const f = fixture(),
      expected = [...f.sheet.drawings!];
    expect(f.actions.replaceCollection([...expected, expected[0]!], expected)).toBe(false);
    expect(f.prepare).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
  });
  test.each([
    "false",
    "throw",
    "true-without-apply",
    "partial-apply",
    "apply-false",
    "apply-throw",
  ])("acknowledges %s only when the exact collection is applied", (mode) => {
    const f = fixture(),
      expected = [...f.sheet.drawings!],
      next = expected.map((d) => ({ ...d, name: "Changed" }));
    f.execute.mockImplementation((command) => {
      if (mode.startsWith("apply")) applyWorkbookCommand(f.workbook, command);
      if (mode === "partial-apply") f.sheet.drawings = [next[0]!, expected[1]!];
      if (mode.includes("throw")) throw new Error("execution");
      return mode === "true-without-apply";
    });
    expect(f.actions.replaceCollection(next, expected)).toBe(mode.startsWith("apply"));
  });
  test("does not acknowledge a command payload changed by its executor", () => {
    const f = fixture(),
      expected = [...f.sheet.drawings!];
    f.execute.mockImplementation((command) => {
      if (command.type !== "setSheetDrawings") throw new Error("Expected drawing command");
      command.drawings[0]!.name = "Executor changed request";
      applyWorkbookCommand(f.workbook, command);
      return true;
    });
    expect(
      f.actions.replaceCollection([{ ...expected[0]!, name: "Requested" }, expected[1]!], expected),
    ).toBe(false);
  });
  test("a reentrant replacement cannot publish a second command", () => {
    const f = fixture(),
      expected = [...f.sheet.drawings!];
    f.prepare.mockImplementationOnce((drawing) => {
      expect(f.actions.replaceCollection([...expected].reverse(), expected)).toBe(false);
      return drawing;
    });
    expect(
      f.actions.replaceCollection([{ ...expected[0]!, name: "Requested" }, expected[1]!], expected),
    ).toBe(true);
    expect(f.execute).toHaveBeenCalledTimes(1);
  });
  test("an explicitly stale metrics snapshot is rejected before preparation", () => {
    const f = fixture(),
      expected = [...f.sheet.drawings!];
    expect(
      f.actions.replaceCollection(
        [{ ...expected[0]!, name: "Changed" }, expected[1]!],
        expected,
        createPictureSheetMetrics(f.sheet),
      ),
    ).toBe(false);
    expect(f.prepare).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
  });
  test("update authorizes its original root, rejects protected inserts and preserves root permissions", () => {
    const f = fixture();
    const owner = { ...framedShape(), shapeProperties: { locked: false as const } };
    f.sheet.drawings = [owner];
    f.sheet.properties.protected = true;
    expect(f.actions.update({ ...owner, name: "Unlocked" }, owner)).toBe(true);
    const current = f.sheet.drawings![0]!;
    if (current.kind !== "shape") throw Error("Expected shape");
    expect(f.actions.replaceCollection([current, { ...owner, id: "fresh" }], [current])).toBe(
      false,
    );
    expect(f.actions.update({ ...current, shapeProperties: {} }, current)).toBe(false);
  });
  test("preserves Core descendant-promotion permission while rejecting a fresh group on a denied sheet", () => {
    const f = fixture(),
      current = f.sheet.drawings!;
    const group = groupShapeRoots(
      current,
      current.map((d) => d.id),
      { id: "group", name: "Group" },
      f.metrics,
    )[0]!;
    if (group.kind !== "shapeGroup") throw new Error("Expected group");
    group.shapeProperties = { locked: false };
    f.sheet.drawings = [group];
    f.sheet.properties.protected = true;
    const promoted = ungroupShapeRoot([group], group.id, f.metrics);
    expect(f.actions.replaceCollection(promoted, [group], f.metrics)).toBe(true);
    const expected = [...f.sheet.drawings!];
    const fresh = groupShapeRoots(
      expected,
      expected.map((d) => d.id),
      { id: "fresh-group", name: "Fresh" },
      f.metrics,
    );
    expect(f.actions.replaceCollection(fresh, expected, f.metrics)).toBe(false);
  });
  test("one batch history record restores the exact forest order with undo and redo", () => {
    const f = fixture(),
      before = structuredClone(f.sheet.drawings!),
      session = createWorkbookSession({
        workbook: f.workbook,
        idFactory: createSequentialIdFactory(),
      });
    f.execute.mockImplementation((command) => executeWorkbookCommand(session, command));
    const expected = [...f.sheet.drawings!],
      next = [
        { ...expected[1]!, name: "Second changed" },
        { ...expected[0]!, name: "First changed" },
      ];
    expect(f.actions.replaceCollection(next, expected)).toBe(true);
    expect(session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(f.sheet.drawings).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(f.sheet.drawings).toEqual(next);
  });
});

test("detached unchanged roots do not block an independent edit on cold resources", () => {
  const f = fixture(),
    expected = [...f.sheet.drawings!];
  const planned = structuredClone(expected);
  planned[0]!.name = "Changed target";
  f.prepare.mockImplementation((drawing) => {
    if (drawing.id === "second") throw new Error("Unselected font pixels are cold");
    return drawing;
  });
  expect(f.actions.replaceCollection(planned, expected, f.metrics)).toBe(true);
  expect(f.prepare).toHaveBeenCalledTimes(1);
  expect(f.prepare.mock.calls[0]![0].id).toBe("shape");
  expect(f.sheet.drawings![1]).toEqual(expected[1]);
});

describe("strict metadata-only shape visibility command", () => {
  test("hide/show preserves unavailable resources and does not prepare text or change placement", () => {
    const f = fixture(),
      expected = [...f.sheet.drawings!];
    f.prepare.mockImplementation(() => {
      throw Error("Font and glyph pixels are unavailable");
    });
    expect(
      f.actions.replaceVisibilityCollection(
        expected.map((node) =>
          node.id === expected[0]!.id ? ({ ...node, hidden: true } as SheetDrawing) : node,
        ),
        expected,
        f.metrics,
      ),
    ).toBe(true);
    expect(f.sheet.drawings![0]).toEqual({ ...expected[0], hidden: true });
    expect(f.prepare).not.toHaveBeenCalled();
    expect(f.execute).toHaveBeenCalledOnce();
    const hidden = [...f.sheet.drawings!],
      first = hidden[0]!;
    if (first.kind !== "shape" && first.kind !== "textBox") throw Error("Expected leaf");
    const { hidden: _hidden, ...shown } = first;
    expect(f.actions.replaceVisibilityCollection([shown, hidden[1]!], hidden, f.metrics)).toBe(
      true,
    );
    expect(f.sheet.drawings).toEqual(expected);
  });
  test.each(["text", "geometry", "name", "style", "lock", "order", "kind", "id", "member"])(
    "visibility-only gate rejects a forged %s edit atomically",
    (field) => {
      const f = fixture(),
        expected = [...f.sheet.drawings!],
        before = structuredClone(expected),
        next = structuredClone(expected);
      const target = next[0];
      if (!target || target.kind !== "shape") throw Error("Expected shape");
      target.hidden = true;
      if (field === "text") target.text = "Forged";
      if (field === "geometry") target.shapeGeometry = { preset: "ellipse" };
      if (field === "name") target.name = "Forged";
      if (field === "style") target.fill = "#ff0000";
      if (field === "lock" && "shapeFrame" in target) target.shapeProperties = { locked: false };
      if (field === "order") next.reverse();
      if (field === "kind") target.kind = "textBox" as "shape";
      if (field === "id") target.id = "forged";
      if (field === "member") next.push({ ...framedShape(), id: "new" });
      expect(f.actions.replaceVisibilityCollection(next, expected, f.metrics)).toBe(false);
      expect(f.sheet.drawings).toEqual(before);
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.prepare).not.toHaveBeenCalled();
    },
  );
  test("source mutation during final guard refuses a metadata overwrite", () => {
    const f = fixture(),
      expected = [...f.sheet.drawings!],
      next = expected.map((node) => ({ ...node, hidden: true }) as SheetDrawing);
    let calls = 0;
    const guard = () => {
      if (++calls === 3) expected[0]!.name = "New external name";
      return true;
    };
    expect(f.actions.replaceVisibilityCollection(next, expected, f.metrics, guard)).toBe(false);
    expect(f.sheet.drawings![0]!.name).toBe("New external name");
    expect(f.sheet.drawings![0]).not.toHaveProperty("hidden");
    expect(f.execute).not.toHaveBeenCalled();
  });
});

test.each(["expected", "next", "iterator"])(
  "visibility metadata admission never executes %s array accessors or custom iteration",
  (unsafe) => {
    const f = fixture(),
      expected = [...f.sheet.drawings!],
      next = expected.map((node) => ({ ...node, hidden: true }) as SheetDrawing),
      read = vi.fn(() => expected[0]);
    const indexed = [...expected];
    if (unsafe === "iterator")
      Object.defineProperty(indexed, Symbol.iterator, {
        value: vi.fn(function* () {
          yield* expected;
        }),
      });
    else Object.defineProperty(indexed, "0", { get: read });
    expect(
      f.actions.replaceVisibilityCollection(
        unsafe === "next" ? indexed : next,
        unsafe === "next" ? expected : indexed,
        f.metrics,
      ),
    ).toBe(false);
    expect(read).not.toHaveBeenCalled();
    if (unsafe === "iterator") expect(indexed[Symbol.iterator]).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.sheet.drawings).toEqual(expected);
  },
);

test("visibility metadata validates the aggregate whole-forest node budget before preparation or execute", () => {
  const f = fixture(),
    m = f.metrics;
  const original = groupShapeRoots(
    f.sheet.drawings!,
    ["shape", "second"],
    { id: "group", name: "Group" },
    m,
  )[0]!;
  if (original.kind !== "shapeGroup") throw Error("Expected group");
  const groups: SheetDrawing[] = [
    {
      ...original,
      id: "large-group",
      members: Array.from({ length: 9998 }, (_, index) => ({
        ...original.members[0]!,
        id: `child-${index}`,
      })),
    },
    ...f.sheet.drawings!,
  ];
  f.sheet.drawings = groups;
  const before = JSON.stringify(groups);
  expect(
    f.actions.replaceVisibilityCollection(
      groups.map((group) => ({ ...group, hidden: true }) as SheetDrawing),
      groups,
      m,
    ),
  ).toBe(false);
  expect(JSON.stringify(f.sheet.drawings)).toBe(before);
  expect(f.execute).not.toHaveBeenCalled();
  expect(f.prepare).not.toHaveBeenCalled();
});

test("visibility metadata admission rejects a changing legacy anchor getter before any read", () => {
  const f = fixture(),
    { shapeFrame: _frame, ...appearance } = framedShape();
  const legacy: SheetDrawing = {
    ...appearance,
    anchor: { row: 0, column: 0 },
    offsetX: 0,
    offsetY: 0,
    width: 240,
    height: 120,
  };
  f.sheet.drawings = [legacy];
  const read = vi.fn(() => 3),
    anchor = Object.defineProperty({ column: 0 }, "row", { enumerable: true, get: read });
  expect(
    f.actions.replaceVisibilityCollection(
      [{ ...legacy, anchor, hidden: true } as SheetDrawing],
      [legacy],
      f.metrics,
    ),
  ).toBe(false);
  expect(read).not.toHaveBeenCalled();
  expect(f.sheet.drawings).toEqual([legacy]);
  expect(f.execute).not.toHaveBeenCalled();
});
