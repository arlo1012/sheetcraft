// 未执行：按用户要求仅编写测试，不运行检查。
import { describe, expect, test, vi } from "vitest";
import { ref, shallowRef } from "vue";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import type { CellSparkline } from "@sheetcraft/core/sparklines";
import {
  createSheet,
  createWorkbook,
  getActiveSheet,
  getCellContent,
  getCellSparkline,
  insertSheet,
  setCellContent,
  setCellSparkline,
  type CellAddress,
  type CellRange,
} from "@sheetcraft/core/workbook";
import { useSparklineTools } from "../../../modules/sparklines/useSparklineTools";

const firstAddress = { row: 1, column: 1 };
const secondAddress = { row: 2, column: 3 };
const outsideAddress = { row: 2, column: 4 };

function definition(row: number, color: string): CellSparkline {
  return {
    type: "line",
    source: { start: { row, column: 0 }, end: { row, column: 2 } },
    color,
    negativeColor: "#ef4444",
    markers: false,
    axis: false,
    showHidden: false,
    empty: "gap",
    highPoint: { show: false, color: row === 5 ? "#aa0000" : "#00bb00" },
  };
}

function fixture() {
  const workbook = shallowRef(createWorkbook({ id: "sparkline-tools", sheetId: "sheet" }));
  const sheet = shallowRef(getActiveSheet(workbook.value));
  const session = createWorkbookSession({
    workbook: workbook.value,
    idFactory: createSequentialIdFactory(),
  });
  const first = definition(5, "#112233");
  const second: CellSparkline = {
    ...definition(6, "#445566"),
    type: "column",
    negativePoints: true,
  };
  const outside = definition(7, "#778899");
  setCellSparkline(sheet.value, firstAddress, first);
  setCellSparkline(sheet.value, secondAddress, second);
  setCellSparkline(sheet.value, outsideAddress, outside);
  setCellContent(sheet.value, firstAddress, { kind: "literal", value: 101 });
  setCellContent(sheet.value, secondAddress, { kind: "literal", value: "Keep this text" });
  setCellContent(sheet.value, { row: 1, column: 2 }, { kind: "literal", value: 42 });
  const range = ref<CellRange>({ start: { ...firstAddress }, end: { ...secondAddress } });
  const address = ref<CellAddress>({ ...firstAddress });
  const generation = ref(0),
    revision = ref(0),
    busy = ref(false);
  const flush = vi.fn(() => true);
  const edit = vi.fn();
  const execute = vi.fn((command: Parameters<typeof executeWorkbookCommand>[1]) => {
    const changed = executeWorkbookCommand(session, command);
    if (changed) revision.value++;
    return changed;
  });
  const tools = useSparklineTools({
    getWorkbook: () => workbook.value,
    getSheet: () => sheet.value,
    getRange: () => range.value,
    getAddress: () => address.value,
    getGeneration: () => generation.value,
    getRevision: () => revision.value,
    isBusy: () => busy.value,
    flush,
    execute,
    edit,
  });
  return {
    workbook,
    sheet,
    session,
    first,
    second,
    outside,
    range,
    address,
    generation,
    revision,
    busy,
    flush,
    edit,
    execute,
    tools,
  };
}

describe("sparkline selection tools", () => {
  test("changes type and point visibility in one undoable batch while preserving each source and color", () => {
    const f = fixture();
    const before = serializeWorkbook(f.session.workbook);

    expect(f.tools.value!.apply({ type: "winLoss", highPoint: { show: true } })).toBe(true);
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(getCellSparkline(f.sheet.value, firstAddress)).toEqual({
      ...f.first,
      type: "winLoss",
      highPoint: { ...f.first.highPoint!, show: true },
    });
    expect(getCellSparkline(f.sheet.value, secondAddress)).toEqual({
      ...f.second,
      type: "winLoss",
      highPoint: { ...f.second.highPoint!, show: true },
    });
    expect(getCellSparkline(f.sheet.value, outsideAddress)).toEqual(f.outside);
    expect(getCellContent(f.sheet.value, firstAddress)).toEqual({ kind: "literal", value: 101 });
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });

  test("distinguishes mixed point colors from mixed checkbox visibility", () => {
    const f = fixture();
    const context = f.tools.value!;

    expect(context.mixed).toEqual(expect.arrayContaining(["type", "color", "highPoint"]));
    expect(context.mixed).not.toContain("source");
    expect(context.mixed).toContain("negativePoints");
    expect(context.value.negativePoints).toBe(false);
    expect(context.mixedPointVisibility).toEqual([]);

    setCellSparkline(f.sheet.value, secondAddress, {
      ...f.second,
      highPoint: { ...f.second.highPoint!, show: true },
    });
    f.revision.value++;
    expect(f.tools.value!.mixedPointVisibility).toEqual(["highPoint"]);
  });

  test("distinguishes different custom axis values from different axis modes", () => {
    const f = fixture();
    setCellSparkline(f.sheet.value, firstAddress, {
      ...f.first,
      minAxis: { type: "custom", value: -10 },
      maxAxis: { type: "group" },
    });
    setCellSparkline(f.sheet.value, secondAddress, {
      ...f.second,
      minAxis: { type: "custom", value: -20 },
      maxAxis: { type: "group" },
    });

    expect(f.tools.value!.mixed).toContain("minAxis");
    expect(f.tools.value!.mixed).not.toContain("maxAxis");
    expect(f.tools.value!.mixedAxisModes).toEqual([]);
  });

  test.each(["minAxis", "maxAxis"] as const)(
    "marks only %s as a mixed axis mode when its selected modes differ",
    (end) => {
      const f = fixture();
      setCellSparkline(f.sheet.value, firstAddress, { ...f.first, [end]: { type: "group" } });
      setCellSparkline(f.sheet.value, secondAddress, {
        ...f.second,
        [end]: { type: "custom", value: 5 },
      });

      expect(f.tools.value!.mixed).toContain(end);
      expect(f.tools.value!.mixedAxisModes).toEqual([end]);
    },
  );

  test("treats omitted axis limits as individual modes without persisting defaults", () => {
    const f = fixture();
    setCellSparkline(f.sheet.value, secondAddress, {
      ...f.second,
      minAxis: { type: "individual" },
      maxAxis: { type: "individual" },
    });

    expect(f.tools.value!.mixedAxisModes).toEqual([]);
    expect(f.tools.value!.mixed).not.toContain("minAxis");
    expect(f.tools.value!.mixed).not.toContain("maxAxis");
    expect(f.tools.value!.apply({ axis: true })).toBe(true);
    expect(getCellSparkline(f.sheet.value, firstAddress)!.minAxis).toBeUndefined();
    expect(getCellSparkline(f.sheet.value, firstAddress)!.maxAxis).toBeUndefined();
  });

  test.each([
    { type: "line" as const, markers: false, effectiveNegative: false },
    { type: "line" as const, markers: true, effectiveNegative: true },
    { type: "column" as const, markers: false, effectiveNegative: true },
  ])(
    "compares explicit settings with legacy $type markers=$markers without writing display defaults",
    ({ type, markers, effectiveNegative }) => {
      const f = fixture();
      setCellSparkline(f.sheet.value, firstAddress, { ...f.first, type, markers });
      setCellSparkline(f.sheet.value, secondAddress, {
        ...f.second,
        type,
        markers,
        color: f.first.color,
        markerColor: f.first.color,
        negativePoints: effectiveNegative,
      });
      const context = f.tools.value!;

      expect(context.value.negativePoints).toBe(effectiveNegative);
      expect(context.mixed).not.toContain("negativePoints");
      expect(context.mixed).not.toContain("markerColor");
      expect(context.apply({ axis: true })).toBe(true);
      expect(Object.hasOwn(getCellSparkline(f.sheet.value, firstAddress)!, "negativePoints")).toBe(
        false,
      );
    },
  );

  test("edits the selected active sparkline and exposes no context for a selection without sparklines", () => {
    const f = fixture();
    f.address.value = { ...secondAddress };
    expect(f.tools.value!.value).toEqual(f.second);
    f.tools.value!.edit();
    expect(f.edit).toHaveBeenCalledWith(secondAddress);
    expect(f.execute).not.toHaveBeenCalled();

    f.range.value = { start: { row: 1, column: 2 }, end: { row: 1, column: 2 } };
    f.address.value = { row: 1, column: 2 };
    expect(f.tools.value).toBeUndefined();
  });

  test("clears only selected sparkline definitions, keeps cell values, and restores them with one undo", () => {
    const f = fixture();
    const before = serializeWorkbook(f.session.workbook);

    expect(f.tools.value!.clear()).toBe(true);
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(getCellSparkline(f.sheet.value, firstAddress)).toBeUndefined();
    expect(getCellSparkline(f.sheet.value, secondAddress)).toBeUndefined();
    expect(getCellSparkline(f.sheet.value, outsideAddress)).toEqual(f.outside);
    expect(getCellContent(f.sheet.value, firstAddress)).toEqual({ kind: "literal", value: 101 });
    expect(getCellContent(f.sheet.value, secondAddress)).toEqual({
      kind: "literal",
      value: "Keep this text",
    });
    expect(getCellContent(f.sheet.value, { row: 1, column: 2 })).toEqual({
      kind: "literal",
      value: 42,
    });
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });

  test("accepts an unchanged legal style with the real Core false result and no history entry", () => {
    const f = fixture();
    const before = serializeWorkbook(f.session.workbook);

    expect(f.tools.value!.apply({ axis: false })).toBe(true);
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.execute.mock.results[0]?.value).toBe(false);
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });

  test("rejects a refused changed style without altering the selected definitions", () => {
    const f = fixture();
    const before = serializeWorkbook(f.session.workbook);
    f.execute.mockReturnValue(false);

    expect(f.tools.value!.apply({ markers: true })).toBe(false);
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });

  test.each([
    "selection",
    "address",
    "revision",
    "sheet",
    "workbook",
    "generation",
    "sheet identity",
  ] as const)("rejects retained apply, clear and edit callbacks after the %s changes", (change) => {
    const f = fixture();
    const context = f.tools.value!;
    if (change === "selection")
      f.range.value = { start: { row: 1, column: 2 }, end: { ...secondAddress } };
    if (change === "address") f.address.value = { ...secondAddress };
    if (change === "revision") f.revision.value++;
    if (change === "generation") f.generation.value++;
    if (change === "sheet") {
      const other = createSheet("Other", "other");
      insertSheet(f.workbook.value, other);
      f.sheet.value = other;
    }
    if (change === "workbook")
      f.workbook.value = createWorkbook({ id: "replacement", sheetId: f.sheet.value.id });
    if (change === "sheet identity")
      f.workbook.value.sheets.set(f.sheet.value.id, createSheet("Replacement", f.sheet.value.id));
    const before = serializeWorkbook(f.session.workbook);

    expect(context.apply({ markers: true })).toBe(false);
    expect(context.clear()).toBe(false);
    context.edit();
    expect(f.edit).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.flush).not.toHaveBeenCalled();
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });

  test.each(["busy", "protected", "locked targets"] as const)(
    "rechecks %s before using captured tool callbacks",
    (block) => {
      const f = fixture();
      const context = f.tools.value!;
      if (block === "busy") f.busy.value = true;
      else {
        f.sheet.value.properties.protected = true;
        if (block === "locked targets")
          f.sheet.value.protection = { formatCells: true, editableRanges: [] };
      }
      const before = serializeWorkbook(f.session.workbook);

      expect(context.apply({ markers: true })).toBe(false);
      expect(context.clear()).toBe(false);
      context.edit();
      expect(f.edit).not.toHaveBeenCalled();
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.flush).not.toHaveBeenCalled();
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    },
  );

  test("refuses apply and clear when pending edits cannot be flushed", () => {
    const f = fixture();
    const context = f.tools.value!;
    const before = serializeWorkbook(f.session.workbook);
    f.flush.mockReturnValue(false);

    expect(context.apply({ markers: true })).toBe(false);
    expect(context.clear()).toBe(false);
    expect(f.flush).toHaveBeenCalledTimes(2);
    expect(f.execute).not.toHaveBeenCalled();
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });

  test("rechecks the selection after a successful flush before executing", () => {
    const f = fixture();
    const context = f.tools.value!;
    const before = serializeWorkbook(f.session.workbook);
    f.flush.mockImplementation(() => {
      f.range.value = { start: { row: 1, column: 2 }, end: { ...secondAddress } };
      return true;
    });

    expect(context.apply({ markers: true })).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });
});
