import { effectScope, ref, shallowRef } from "vue";
import { describe, expect, test, vi } from "vitest";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { createSheet, getActiveSheet, type Workbook } from "@sheetcraft/core/workbook";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import { useChartObjectControls } from "../../../modules/charts/useChartObjectControls";

function drawing(id = "chart-one"): SheetChartDrawing {
  return {
    id,
    kind: "chart",
    name: "Sales",
    anchor: { row: 2, column: 3 },
    offsetX: 8,
    offsetY: 9,
    width: 480,
    height: 300,
    text: "",
    shape: "rectangle",
    fill: "#ffffff",
    stroke: "#111111",
    strokeWidth: 1,
    color: "#111111",
    fontSize: 14,
    bold: false,
    italic: false,
    rotation: 0,
    chart: {
      type: "column",
      range: { start: { row: 0, column: 0 }, end: { row: 3, column: 2 } },
      title: "Sales",
      headerRow: true,
      headerColumn: true,
      seriesBy: "columns",
      legend: true,
      labels: false,
      stacked: false,
      showHidden: false,
    },
  };
}
function fixture() {
  const session = createWorkbookSession({ idFactory: createSequentialIdFactory() });
  const workbook = shallowRef<Workbook>(session.workbook);
  const sheet = shallowRef(getActiveSheet(workbook.value));
  const first = drawing(),
    other = drawing("chart-two");
  sheet.value.drawings = [first, other];
  const selected = ref<string | null>(first.id),
    generation = ref(1),
    revision = ref(0),
    busy = ref(false);
  const edit = vi.fn(),
    flush = vi.fn(() => true);
  const execute = vi.fn((command: Parameters<typeof executeWorkbookCommand>[1]) => {
    const changed = executeWorkbookCommand(session, command);
    if (changed) revision.value++;
    return changed;
  });
  const scope = effectScope();
  const controls = scope.run(() =>
    useChartObjectControls({
      getWorkbook: () => workbook.value,
      getSheet: () => sheet.value,
      getGeneration: () => generation.value,
      getRevision: () => revision.value,
      getSelectedId: () => selected.value,
      isBusy: () => busy.value,
      flush,
      execute,
      edit,
    }),
  )!;
  const current = () => {
    const root = sheet.value.drawings?.find((item) => item.id === first.id);
    if (!root || root.kind !== "chart") throw Error("missing chart");
    return root;
  };
  return {
    session,
    workbook,
    sheet,
    selected,
    generation,
    revision,
    busy,
    flush,
    execute,
    edit,
    scope,
    controls,
    first,
    other,
    current,
  };
}
describe("chart owner element controls", () => {
  test("changes only captured chart elements, preserving geometry/source and one UndoRedo", () => {
    const f = fixture(),
      before = structuredClone(f.first);
    expect(
      f.controls.snapshot.value!.apply({
        title: "Updated",
        labels: true,
        elements: {
          titlePosition: "overlay",
          legendPosition: "right",
          labelPosition: "outsideEnd",
        },
      }),
    ).toBe(true);
    expect(f.current().chart).toMatchObject({
      title: "Updated",
      labels: true,
      elements: { titlePosition: "overlay", legendPosition: "right", labelPosition: "outsideEnd" },
    });
    expect({ ...f.current(), chart: f.first.chart }).toEqual(f.first);
    expect(f.sheet.value.drawings?.[1]).toEqual(f.other);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    f.revision.value++;
    expect(f.current()).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    f.revision.value++;
    expect(f.current().chart.title).toBe("Updated");
  });
  test("no-op is successful without consuming history; rejected execute leaves source untouched", () => {
    const f = fixture(),
      callback = f.controls.snapshot.value!.apply;
    expect(callback({ title: "Sales" })).toBe(true);
    expect(f.execute).not.toHaveBeenCalled();
    f.execute.mockImplementationOnce(() => false);
    expect(callback({ title: "Rejected" })).toBe(false);
    expect(f.current()).toBe(f.first);
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(f.controls.error.value).toBe(true);
  });
  test.each([
    "sheet",
    "book",
    "generation",
    "revision",
    "selection",
    "same-id",
    "forest",
    "dispose",
  ] as const)("rejects a stale callback after %s changes", (kind) => {
    const f = fixture(),
      old = f.controls.snapshot.value!;
    if (kind === "sheet") {
      const sheet = createSheet("Other", "other");
      f.workbook.value.sheets.set(sheet.id, sheet);
      f.sheet.value = sheet;
    }
    if (kind === "book") {
      const other = createWorkbookSession({ idFactory: createSequentialIdFactory() });
      f.workbook.value = other.workbook;
      f.sheet.value = getActiveSheet(other.workbook);
    }
    if (kind === "generation") f.generation.value++;
    if (kind === "revision") f.revision.value++;
    if (kind === "selection") f.selected.value = f.other.id;
    if (kind === "same-id")
      f.sheet.value.drawings = [{ ...f.first, chart: { ...f.first.chart } }, f.other];
    if (kind === "forest") f.sheet.value.drawings = [f.first, f.other];
    if (kind === "dispose") f.scope.stop();
    expect(old.apply({ title: "Stale" })).toBe(false);
    old.edit();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.edit).not.toHaveBeenCalled();
  });
  test.each(["busy", "protected", "flush-refusal", "flush-switch"] as const)(
    "preserves state when preparation refuses at %s",
    (kind) => {
      const f = fixture(),
        old = f.controls.snapshot.value!;
      if (kind === "busy") f.busy.value = true;
      if (kind === "protected") f.sheet.value.properties.protected = true;
      if (kind === "flush-refusal") f.flush.mockReturnValueOnce(false);
      if (kind === "flush-switch")
        f.flush.mockImplementationOnce(() => {
          f.selected.value = f.other.id;
          return true;
        });
      expect(old.apply({ title: "No" })).toBe(false);
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.current()).toBe(f.first);
    },
  );
  test("switches ordinary direction atomically and cannot retarget the old direction callback", () => {
    const f = fixture(),
      old = f.controls.snapshot.value!;
    expect(old.switchDirection?.()).toBe(true);
    expect(f.current().chart.seriesBy).toBe("rows");
    expect(old.switchDirection?.()).toBe(false);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    f.revision.value++;
    expect(f.current().chart.seriesBy).toBe("columns");
  });
  test("linked and cached charts never offer a fake row/column source switch", () => {
    const f = fixture();
    f.sheet.value.drawings = [{ ...f.first, chart: { ...f.first.chart, pivotTableId: "report" } }];
    f.revision.value++;
    expect(f.controls.snapshot.value!.switchDirection).toBeUndefined();
    f.sheet.value.drawings = [
      {
        ...f.first,
        chart: { ...f.first.chart, dataCache: { categories: [], series: [], records: [] } },
      },
    ];
    f.revision.value++;
    expect(f.controls.snapshot.value!.switchDirection).toBeUndefined();
  });
  test("pending title and direction are one command; title then source opens only its replacement", () => {
    const f = fixture();
    expect(f.controls.snapshot.value!.applyAndRun({ title: "Together" }, "switchDirection")).toBe(
      true,
    );
    expect(f.current().chart).toMatchObject({ title: "Together", seriesBy: "rows" });
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    f.revision.value++;
    expect(f.current().chart).toMatchObject({ title: "Sales", seriesBy: "columns" });
    expect(f.controls.snapshot.value!.applyAndRun({ title: "Source title" }, "source")).toBe(true);
    expect(f.edit).toHaveBeenCalledExactlyOnceWith(f.current());
    expect(f.current().chart.title).toBe("Source title");
  });
  test("title action chain cannot edit a newly selected owner or a rogue replacement", () => {
    for (const kind of ["selection", "replacement"] as const) {
      const f = fixture();
      const normalExecute = f.execute.getMockImplementation()!;
      f.execute.mockImplementationOnce((command) => {
        const result = normalExecute(command);
        if (kind === "selection") f.selected.value = f.other.id;
        else {
          f.sheet.value.drawings = [
            { ...f.current(), chart: { ...f.current().chart, title: "Different replacement" } },
            f.other,
          ];
        }
        return result;
      });
      expect(f.controls.snapshot.value!.applyAndRun({ title: "Planned" }, "source")).toBe(false);
      expect(f.edit).not.toHaveBeenCalled();
      expect(f.other.chart.title).toBe("Sales");
    }
  });
  test("reentrant or throwing edit flush refuses without a second command", () => {
    const f = fixture();
    const callback = f.controls.snapshot.value!.apply;
    f.flush.mockImplementationOnce(() => {
      expect(callback({ title: "Inner" })).toBe(false);
      return true;
    });
    expect(callback({ title: "Outer" })).toBe(true);
    expect(f.execute).toHaveBeenCalledTimes(1);
    f.flush.mockImplementationOnce(() => {
      throw Error("flush refused");
    });
    expect(f.controls.snapshot.value!.apply({ title: "No" })).toBe(false);
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.current().chart.title).toBe("Outer");
  });
  test("unsupported controls and rogue source changes are rejected with zero side effects", () => {
    const f = fixture();
    expect(
      f.controls.snapshot.value!.apply({
        elements: { labelPosition: "center", legendPosition: "left" },
      }),
    ).toBe(true);
    f.sheet.value.drawings = [{ ...f.first, chart: { ...f.first.chart, type: "wordCloud" } }];
    f.revision.value++;
    const before = JSON.stringify(f.sheet.value.drawings);
    const historyLength = f.session.history.undoStack.length;
    const executions = f.execute.mock.calls.length;
    expect(f.controls.snapshot.value!.apply({ legend: true })).toBe(false);
    expect(f.controls.snapshot.value!.apply({ stacked: true })).toBe(false);
    const getter = vi.fn(() => "Unsafe");
    const patch = Object.defineProperty({}, "title", { get: getter });
    expect(f.controls.snapshot.value!.apply(patch)).toBe(false);
    expect(getter).not.toHaveBeenCalled();
    expect(JSON.stringify(f.sheet.value.drawings)).toBe(before);
    expect(f.session.history.undoStack).toHaveLength(historyLength);
    expect(f.execute).toHaveBeenCalledTimes(executions);
    expect(f.current().chart.title).toBe("Sales");
  });
});
