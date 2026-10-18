import { setChartTextFontFamily } from "../../../modules/charts/chart-format-pane";
import { effectScope, ref, shallowRef, type EffectScope } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createSetSheetDrawingsCommand } from "@sheetcraft/core/commands";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { serializeWorkbook, deserializeWorkbook } from "@sheetcraft/core/serialization";
import { normalizeSheetChart } from "@sheetcraft/core/sheet-charts";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  createSheet,
  createWorkbookEvaluator,
  getActiveSheet,
  insertSheet,
  type Workbook,
} from "@sheetcraft/core/workbook";
import type {
  ChartFormatIntent,
  ChartFormatTarget,
} from "../../../modules/charts/chart-format-pane";
import { applyChartFormatIntent } from "../../../modules/charts/chart-format-intents";
import { useChartFormatControls } from "../../../modules/charts/useChartFormatControls";

const scopes: EffectScope[] = [];
afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop();
});

function drawing(id = "chart-one"): SheetChartDrawing {
  return {
    id,
    kind: "chart",
    name: "Sales",
    anchor: { row: 5, column: 3 },
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
    chart: normalizeSheetChart({
      type: "column",
      range: null,
      title: "Sales",
      headerRow: true,
      headerColumn: true,
      seriesBy: "columns",
      legend: true,
      labels: false,
      stacked: false,
      showHidden: false,
      source: {
        kind: "series",
        categories: { kind: "generated" },
        series: [
          {
            id: "apples",
            colorIndex: 5,
            name: { kind: "literal", text: "Same name" },
            values: { kind: "literal", values: [10, 20] },
          },
          {
            id: "pears",
            colorIndex: 2,
            name: { kind: "literal", text: "Same name" },
            values: { kind: "literal", values: [30, 40] },
          },
        ],
      },
      elements: {
        titlePosition: "overlay",
        legendPosition: "right",
        legendOverlay: false,
        labelPosition: "outsideEnd",
      },
      format: {
        title: { color: "#123456", bold: true },
        plot: { fill: "transparent", stroke: "#234567", strokeWidth: 2 },
        categoryAxis: { title: "Region", reverse: true, text: { italic: true } },
        valueAxis: { title: "Primary", line: { stroke: "#345678" } },
        secondaryValueAxis: { title: "Secondary", text: { color: "#456789" } },
        bar: { gapWidth: 50, overlap: 25 },
        series: [
          { id: "apples", color: "#56789a", smooth: true, markers: false },
          { id: "pears", axis: "secondary", color: "#6789ab" },
          { id: "dormant", axis: "secondary", color: "#789abc", strokeWidth: 3 },
        ],
      },
    }),
  };
}

function fixture(initialTarget: ChartFormatTarget = { kind: "title" }) {
  const session = createWorkbookSession({ idFactory: createSequentialIdFactory() });
  const workbook = shallowRef<Workbook>(session.workbook);
  const sheet = shallowRef(getActiveSheet(workbook.value));
  const ownerSheet = sheet.value;
  const otherSheet = createSheet("Other Sheet", "other");
  insertSheet(workbook.value, otherSheet);
  const first = drawing(),
    other = drawing("chart-two");
  ownerSheet.drawings = [first, other];
  otherSheet.drawings = [drawing()];
  const selected = ref<string | null>(first.id),
    target = shallowRef<ChartFormatTarget>(initialTarget),
    generation = ref(1),
    revision = ref(0),
    open = ref(true),
    busy = ref(false);
  const flush = vi.fn(() => true);
  const execute = vi.fn((command: Parameters<typeof executeWorkbookCommand>[1]) => {
    const changed = executeWorkbookCommand(session, command);
    if (changed) revision.value++;
    return changed;
  });
  const scope = effectScope();
  scopes.push(scope);
  const controls = scope.run(() =>
    useChartFormatControls({
      getWorkbook: () => workbook.value,
      getSheet: () => sheet.value,
      getGeneration: () => generation.value,
      getRevision: () => revision.value,
      getSelectedId: () => selected.value,
      getTarget: () => target.value,
      getEvaluator: () => createWorkbookEvaluator(workbook.value, sheet.value.id),
      isOpen: () => open.value,
      isBusy: () => busy.value,
      flush,
      execute,
    }),
  )!;
  const current = () => {
    const root = ownerSheet.drawings?.find((entry) => entry.id === first.id);
    if (!root || root.kind !== "chart") throw new Error("Missing owner chart");
    return root;
  };
  return {
    session,
    workbook,
    sheet,
    ownerSheet,
    otherSheet,
    first,
    other,
    selected,
    target,
    generation,
    revision,
    open,
    busy,
    flush,
    execute,
    scope,
    controls,
    current,
  };
}

const titleIntent: ChartFormatIntent = {
  kind: "title",
  format: { fontSize: 22, color: "#abcdef" },
};

describe("captured chart format owner controls", () => {
  test("changes one branch with one exact Undo/Redo while preserving source, geometry and dormant style", () => {
    const f = fixture(),
      before = structuredClone(f.ownerSheet.drawings);
    expect(f.controls.snapshot.value!.apply(titleIntent)).toBe(true);
    const changed = structuredClone(f.ownerSheet.drawings);
    expect(f.current().chart.format).toEqual({
      ...f.first.chart.format,
      title: titleIntent.format,
    });
    expect({ ...f.current(), chart: f.first.chart }).toEqual(f.first);
    expect({ ...f.current().chart, format: f.first.chart.format }).toEqual(f.first.chart);
    expect(f.ownerSheet.drawings?.[1]).toEqual(f.other);
    expect(f.otherSheet.drawings).toEqual([drawing()]);
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    f.revision.value++;
    expect(f.ownerSheet.drawings).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    f.revision.value++;
    expect(f.ownerSheet.drawings).toEqual(changed);
  });

  test("execute false preserves the same source/style owner with zero history and allows a single retry", () => {
    const f = fixture(),
      owner = f.controls.snapshot.value!,
      forest = f.ownerSheet.drawings,
      before = structuredClone(f.first);
    f.execute.mockImplementationOnce(() => false);
    expect(owner.apply(titleIntent)).toBe(false);
    expect(f.ownerSheet.drawings).toBe(forest);
    expect(f.current()).toBe(f.first);
    expect(f.current()).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(f.session.history.redoStack).toHaveLength(0);
    expect(f.controls.error.value).toBe(true);
    expect(owner.isCurrent()).toBe(true);
    expect(owner.apply(titleIntent)).toBe(true);
    expect(f.controls.error.value).toBe(false);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(owner.apply(titleIntent)).toBe(false);
    expect(f.execute).toHaveBeenCalledTimes(2);
  });

  test("same normalized format succeeds without consuming history or an existing redo branch", () => {
    const f = fixture();
    expect(
      f.execute(
        createSetSheetDrawingsCommand(f.ownerSheet.id, [
          { ...f.first, chart: { ...f.first.chart, title: "Undo me" } },
          f.other,
        ]),
      ),
    ).toBe(true);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    f.revision.value++;
    const before = structuredClone(f.ownerSheet.drawings),
      redo = [...f.session.history.redoStack],
      owner = f.controls.snapshot.value!;
    f.execute.mockClear();
    expect(owner.apply({ kind: "title", format: { ...f.current().chart.format!.title! } })).toBe(
      true,
    );
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.ownerSheet.drawings).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(f.session.history.redoStack).toEqual(redo);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(f.current().chart.title).toBe("Undo me");
  });

  test.each([
    "selection",
    "sheet",
    "book",
    "generation",
    "revision",
    "target",
    "equivalent-target",
    "same-id",
    "forest",
    "deleted-sheet",
    "closed",
    "dispose",
  ] as const)("a stale handler cannot retarget after %s changes", (kind) => {
    const f = fixture(),
      owner = f.controls.snapshot.value!;
    if (kind === "selection") f.selected.value = f.other.id;
    if (kind === "sheet") f.sheet.value = f.otherSheet;
    if (kind === "book") {
      f.workbook.value = createWorkbookSession({ idFactory: createSequentialIdFactory() }).workbook;
      f.sheet.value = getActiveSheet(f.workbook.value);
    }
    if (kind === "generation") f.generation.value++;
    if (kind === "revision") f.revision.value++;
    if (kind === "target") f.target.value = { kind: "plot" };
    if (kind === "equivalent-target") f.target.value = { kind: "title" };
    if (kind === "same-id") f.ownerSheet.drawings = [drawing(), f.other];
    if (kind === "forest") f.ownerSheet.drawings = [f.first, f.other];
    if (kind === "deleted-sheet") f.workbook.value.sheets.delete(f.ownerSheet.id);
    if (kind === "closed") f.open.value = false;
    if (kind === "dispose") f.scope.stop();
    const before = structuredClone(f.ownerSheet.drawings),
      otherBefore = structuredClone(f.otherSheet.drawings);
    expect(owner.isCurrent()).toBe(false);
    expect(owner.apply(titleIntent)).toBe(false);
    expect(f.flush).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.ownerSheet.drawings).toEqual(before);
    expect(f.otherSheet.drawings).toEqual(otherBefore);
    expect(f.session.history.undoStack).toHaveLength(0);
  });

  test("Undo invalidates both pre-edit and post-edit handlers without destroying Redo", () => {
    const f = fixture(),
      old = f.controls.snapshot.value!;
    expect(old.apply(titleIntent)).toBe(true);
    const afterEdit = f.controls.snapshot.value!;
    expect(undoWorkbookCommand(f.session)).toBe(true);
    f.revision.value++;
    const before = structuredClone(f.ownerSheet.drawings),
      redo = [...f.session.history.redoStack];
    f.execute.mockClear();
    for (const owner of [old, afterEdit]) {
      expect(owner.isCurrent()).toBe(false);
      expect(owner.apply(titleIntent)).toBe(false);
    }
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.ownerSheet.drawings).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(f.session.history.redoStack).toEqual(redo);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(f.current().chart.format?.title).toEqual(titleIntent.format);
  });

  test.each([
    "selection",
    "sheet",
    "generation",
    "revision",
    "target",
    "replacement",
    "permission",
    "busy",
    "closed",
    "false",
    "throw",
  ] as const)("flush that causes %s cannot apply to a later owner", (kind) => {
    const f = fixture(),
      owner = f.controls.snapshot.value!;
    f.flush.mockImplementationOnce(() => {
      if (kind === "selection") f.selected.value = f.other.id;
      if (kind === "sheet") f.sheet.value = f.otherSheet;
      if (kind === "generation") f.generation.value++;
      if (kind === "revision") f.revision.value++;
      if (kind === "target") f.target.value = { kind: "plot" };
      if (kind === "replacement") f.ownerSheet.drawings = [drawing(), f.other];
      if (kind === "permission") f.ownerSheet.properties.protected = true;
      if (kind === "busy") f.busy.value = true;
      if (kind === "closed") f.open.value = false;
      if (kind === "throw") throw new Error("flush refused");
      return kind !== "false";
    });
    expect(owner.apply(titleIntent)).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.ownerSheet.drawings).toEqual([f.first, f.other]);
    expect(f.otherSheet.drawings).toEqual([drawing()]);
    expect(f.session.history.undoStack).toHaveLength(0);
  });

  test.each(["busy", "protected"] as const)("%s blocks formatting before flush", (kind) => {
    const f = fixture();
    if (kind === "busy") f.busy.value = true;
    else f.ownerSheet.properties.protected = true;
    expect(f.controls.snapshot.value!.apply(titleIntent)).toBe(false);
    expect(f.controls.snapshot.value!.disabled).toBe(kind === "protected");
    expect(f.flush).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.current()).toBe(f.first);
    expect(f.session.history.undoStack).toHaveLength(0);
  });

  test("reentrant flush cannot submit an additional format command", () => {
    const f = fixture(),
      owner = f.controls.snapshot.value!;
    f.flush.mockImplementationOnce(() => {
      expect(owner.apply({ kind: "title", format: { fontSize: 33 } })).toBe(false);
      return true;
    });
    expect(owner.apply(titleIntent)).toBe(true);
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(f.current().chart.format?.title).toEqual(titleIntent.format);
  });

  test("series formatting follows the captured stable ID after source reorder, preserving other and dormant branches", () => {
    const f = fixture({ kind: "series", seriesId: "apples" });
    f.ownerSheet.drawings = [
      {
        ...f.first,
        chart: normalizeSheetChart({
          ...f.first.chart,
          source: { ...f.first.chart.source!, series: [...f.first.chart.source!.series].reverse() },
        }),
      },
      f.other,
    ];
    f.revision.value++;
    const before = structuredClone(f.current());
    expect(
      f.controls.snapshot.value!.apply({
        kind: "series",
        seriesId: "apples",
        format: { color: "#abcdef", axis: "primary" },
      }),
    ).toBe(true);
    expect(f.current().chart.source).toEqual(before.chart.source);
    expect(f.current().chart.source?.series.map((entry) => [entry.id, entry.colorIndex])).toEqual([
      ["pears", 2],
      ["apples", 5],
    ]);
    expect(f.current().chart.format).toEqual({
      ...before.chart.format,
      series: [
        { id: "apples", axis: "primary", color: "#abcdef" },
        ...before.chart.format!.series!.slice(1),
      ],
    });
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    f.revision.value++;
    expect(f.current()).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(f.current().chart.format?.series?.[0]?.id).toBe("apples");
  });

  test("global bar layout can be changed from a selected source series with one reversible command", () => {
    const f = fixture({ kind: "series", seriesId: "pears" }),
      before = structuredClone(f.first);
    expect(
      f.controls.snapshot.value!.apply({ kind: "chart", format: { gapWidth: 125, overlap: -25 } }),
    ).toBe(true);
    expect(f.current().chart.format).toEqual({
      ...before.chart.format,
      bar: { gapWidth: 125, overlap: -25 },
    });
    expect({ ...f.current().chart, format: before.chart.format }).toEqual(before.chart);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(f.current()).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(f.current().chart.format?.bar).toEqual({ gapWidth: 125, overlap: -25 });
  });

  test.each([
    { kind: "title" },
    { kind: "plot" },
    { kind: "series", seriesId: "foreign" },
  ] as const)("global bar intent rejects an unrelated $kind target with zero history", (target) => {
    const f = fixture(target),
      before = structuredClone(f.first);
    expect(f.controls.snapshot.value!.apply({ kind: "chart", format: { gapWidth: 125 } })).toBe(
      false,
    );
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.current()).toBe(f.first);
    expect(f.current()).toEqual(before);
    expect(f.controls.error.value).toBe(true);
    expect(f.session.history.undoStack).toHaveLength(0);
  });

  test.each(["valueAxis", "secondaryValueAxis"] as const)(
    "%s derived tick-budget preflight rejects otherwise valid sparse units without a history write",
    (kind) => {
      const f = fixture({ kind }),
        before = structuredClone(f.first),
        forest = f.ownerSheet.drawings;
      // A single unit passes persisted validation; its real source domain requires over 2048 ticks.
      const intent: ChartFormatIntent = { kind, format: { majorUnit: 0.001 } };
      expect(() => applyChartFormatIntent(f.first.chart, { kind }, intent)).not.toThrow();
      expect(f.controls.snapshot.value!.apply(intent)).toBe(false);
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.ownerSheet.drawings).toBe(forest);
      expect(f.current()).toEqual(before);
      expect(f.controls.error.value).toBe(true);
      expect(f.session.history.undoStack).toHaveLength(0);
      expect(f.session.history.redoStack).toHaveLength(0);
    },
  );
});

test("legend layout is one undoable command and survives workbook save/reopen without new style fields", () => {
  const f = fixture({ kind: "legend" });
  const before = structuredClone(f.current());
  expect(
    f.controls.snapshot.value!.apply({
      kind: "elements",
      patch: { elements: { legendPosition: "topRight", legendOverlay: true } },
    }),
  ).toBe(true);
  expect(f.session.history.undoStack).toHaveLength(1);
  const changed = structuredClone(f.current());
  const reopened = deserializeWorkbook(serializeWorkbook(f.workbook.value));
  expect(reopened.sheets.get(f.ownerSheet.id)?.drawings?.[0]).toEqual(changed);
  expect(undoWorkbookCommand(f.session)).toBe(true);
  f.revision.value++;
  expect(f.current()).toEqual(before);
  expect(redoWorkbookCommand(f.session)).toBe(true);
  f.revision.value++;
  expect(f.current()).toEqual(changed);
  expect(f.controls.snapshot.value!.apply({ kind: "legend", reset: true })).toBe(true);
  expect(f.current().chart.elements).toEqual({
    titlePosition: "overlay",
    labelPosition: "outsideEnd",
  });
  expect(f.current().chart.format).toEqual(before.chart.format);
  const history = f.session.history.undoStack.length;
  expect(f.controls.snapshot.value!.apply({ kind: "legend", reset: true })).toBe(true);
  expect(f.session.history.undoStack).toHaveLength(history);
});

test("legend text and surface are one owned undoable edit, survive snapshot and remain after layout reset", () => {
  const f = fixture({ kind: "legend" });
  const before = structuredClone(f.current());
  const legend = {
    text: { fontFamily: "Arial", fontSize: 18, bold: true, italic: true, color: "#123456" },
    surface: { fill: "#abcdef", stroke: "transparent", strokeWidth: 2 },
  };
  const old = f.controls.snapshot.value!;
  expect(old.apply({ kind: "legend", format: legend })).toBe(true);
  expect(f.session.history.undoStack).toHaveLength(1);
  expect(old.apply({ kind: "legend", format: undefined })).toBe(false);
  const changed = structuredClone(f.current());
  expect(
    deserializeWorkbook(serializeWorkbook(f.workbook.value)).sheets.get(f.ownerSheet.id)
      ?.drawings?.[0],
  ).toEqual(changed);
  expect(undoWorkbookCommand(f.session)).toBe(true);
  f.revision.value++;
  expect(f.current()).toEqual(before);
  expect(redoWorkbookCommand(f.session)).toBe(true);
  f.revision.value++;
  expect(f.current()).toEqual(changed);
  expect(f.controls.snapshot.value!.apply({ kind: "legend", reset: true })).toBe(true);
  expect(f.current().chart.format?.legend).toEqual(legend);
});

test("font replacement and default undo restore exact script bindings and sibling text", () => {
  const f = fixture();
  const scriptFonts = {
    latin: { kind: "theme", role: "minor", slot: "latin" },
    eastAsia: { kind: "family", family: "宋体" },
    complexScript: { kind: "automatic" },
  } as const;
  f.first.chart.format!.title = { scriptFonts, bold: true, fontSize: 16 };
  f.first.chart.format!.legend = { text: { scriptFonts, italic: true } };
  const before = structuredClone(f.ownerSheet.drawings);
  for (const family of ["Arial", undefined]) {
    const format = setChartTextFontFamily(f.current().chart.format!.title!, family);
    expect(f.controls.snapshot.value!.apply({ kind: "title", format })).toBe(true);
    expect(f.current().chart.format!.title).toEqual({
      bold: true,
      fontSize: 16,
      ...(family ? { fontFamily: family } : {}),
    });
    expect(f.current().chart.format!.legend).toEqual(f.first.chart.format!.legend);
    const after = structuredClone(f.ownerSheet.drawings);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    f.revision.value++;
    expect(f.ownerSheet.drawings).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    f.revision.value++;
    expect(f.ownerSheet.drawings).toEqual(after);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    f.revision.value++;
  }
});
