// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import { effectScope } from "vue";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import {
  createPictureSheetMetrics,
  type PictureSheetMetrics,
} from "@sheetcraft/core/picture-axis-metrics";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  normalizeShapeDrawingForest,
  isShapeGroupEligibleRoot,
} from "@sheetcraft/core/shape-group-planning";
import { serializeWorkbook, deserializeWorkbook } from "@sheetcraft/core/serialization";
import { getSheetChartData, type ChartType } from "@sheetcraft/core/sheet-charts";
import type { SheetChartDrawing, SheetDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  createWorkbook,
  createSheet,
  getActiveSheet,
  createWorkbookEvaluator,
  setCellValue,
  type Sheet,
} from "@sheetcraft/core/workbook";
import { useDrawingActions } from "../../../modules/sheet-drawings/useDrawingActions";
import { useShapeDrawingTransfer } from "../../../modules/sheet-drawings/useShapeDrawingTransfer";
import { useShapeClipboard } from "../../../modules/sheet-drawings/useShapeClipboard";
import {
  isDrawingClipboardEligibleRoot,
  resolveDrawingClipboardRootLayout,
} from "../../../modules/sheet-drawings/drawing-clipboard-eligibility";
import { planChartClipboardSourceForTarget } from "../../../modules/charts/chart-clipboard-source";

function chart(type: ChartType = "column"): SheetChartDrawing {
  return {
    id: "chart",
    kind: "chart",
    name: "Sales",
    anchor: { row: 2, column: 1 },
    offsetX: 8,
    offsetY: 8,
    text: "",
    shape: "rectangle",
    fill: "transparent",
    stroke: "#2563eb",
    strokeWidth: 1,
    color: "#1e3a8a",
    fontSize: 20,
    bold: false,
    italic: false,
    rotation: 37,
    width: 480,
    height: 300,
    chart: {
      type,
      range: { start: { row: 0, column: 0 }, end: { row: 2, column: 2 } },
      title: "Sales",
      headerRow: true,
      headerColumn: true,
      seriesBy: "columns",
      legend: true,
      labels: true,
      stacked: false,
      showHidden: false,
      elements: {
        titlePosition: "overlay",
        legendPosition: "right",
        legendOverlay: false,
        labelPosition: "insideEnd",
      },
      format: {
        bar: { gapWidth: 50, overlap: 20 },
        title: { fontFamily: "Arial", fontSize: 20, color: "#123456", bold: true },
        series: [{ id: "dormant", axis: "secondary", color: "#ABCDEF" }],
      },
    },
  };
}
function fixture(type: ChartType = "column", prepareSource = true) {
  const workbook = createWorkbook({ id: "book", sheetId: "source" });
  const source = getActiveSheet(workbook),
    target = createSheet("Target", "target");
  workbook.sheets.set(target.id, target);
  for (const sheet of [source, target]) {
    [
      ["Region", "A", "B"],
      ["East", 10, 20],
      ["West", 30, 40],
    ].forEach((row, r) =>
      row.forEach((value, column) =>
        setCellValue(
          sheet,
          { row: r, column },
          typeof value === "number" && sheet === target ? value + 1000 : value,
        ),
      ),
    );
  }
  source.drawings = normalizeShapeDrawingForest([chart(type)]);
  const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
  let active = source,
    metrics = createPictureSheetMetrics(source),
    revision = 0,
    ids = 0,
    address = { row: 4, column: 3 };
  const scope = effectScope();
  const execute = vi.fn((command: Parameters<typeof executeWorkbookCommand>[1]) => {
    const accepted = executeWorkbookCommand(session, command);
    if (accepted) revision++;
    return accepted;
  });
  const options = {
    getWorkbook: () => workbook,
    getSheet: () => active,
    getGeneration: () => 0,
    getRevision: () => revision,
    getDocumentRevision: () => session.history.revision,
    getMetrics: () => metrics,
    getAddress: () => address,
    isBusy: () => false,
    flush: vi.fn(() => true),
  };
  const prepareDrawing = vi.fn((drawing: SheetDrawing, _owner?: SheetDrawing) => drawing);
  const prepareTransfer = vi.fn(
    (_sheet: Sheet, _metrics: PictureSheetMetrics, drawing: SheetDrawing, _owner?: SheetDrawing) =>
      drawing,
  );
  const actions = scope.run(() =>
    useDrawingActions({ ...options, execute, prepareDrawing, name: (kind) => kind }),
  )!;
  const transfer = useShapeDrawingTransfer({
    ...options,
    execute,
    prepareDrawing: prepareTransfer,
    preflightConnectedCollection: () => true,
  });
  const replaceCollection = vi.fn(actions.replaceCollectionPreservingGeometry),
    replaceCollections = vi.fn(transfer.replaceCollections),
    feedback = vi.fn();
  const prepareRootsForTarget = vi.fn(
    (roots: readonly SheetDrawing[], sourceSheet: Sheet, targetSheet: Sheet) =>
      roots.map((drawing) =>
        drawing.kind === "chart"
          ? planChartClipboardSourceForTarget({
              drawing,
              sourceSheet,
              targetSheet,
              evaluator: createWorkbookEvaluator(workbook, sourceSheet.id),
              resolveSheet: (id) => workbook.sheets.get(id),
            })
          : drawing,
      ),
  );
  const clipboard = useShapeClipboard({
    ...options,
    getSelectedPaths: () => [["chart"]],
    getTargetAddress: () => address,
    replaceCollection,
    replaceCollections,
    createId: () => `fresh-${++ids}`,
    onFeedback: feedback,
    ...(prepareSource ? { prepareRootsForTarget } : {}),
  });
  return {
    workbook,
    source,
    target,
    session,
    scope,
    clipboard,
    actions,
    transfer,
    execute,
    prepareDrawing,
    prepareTransfer,
    replaceCollection,
    replaceCollections,
    feedback,
    prepareRootsForTarget,
    navigate() {
      active = target;
      workbook.activeSheetId = target.id;
      metrics = createPictureSheetMetrics(target);
      revision++;
    },
    address(next: { row: number; column: number }) {
      address = next;
    },
  };
}
const allTypes: ChartType[] = [
  "column",
  "bar",
  "line",
  "area",
  "pie",
  "doughnut",
  "scatter",
  "radar",
  "treemap",
  "sankey",
  "river",
  "wordCloud",
];
function drawing(sheet: Sheet, index = 0): SheetChartDrawing {
  const value = sheet.drawings?.[index];
  if (!value || value.kind !== "chart") throw Error("Missing chart");
  return value;
}
function snapshot(f: ReturnType<typeof fixture>) {
  return serializeWorkbook(f.workbook);
}
function presentation(f: ReturnType<typeof fixture>, sheet: Sheet) {
  const node = drawing(sheet),
    data = getSheetChartData(
      sheet,
      node.chart,
      createWorkbookEvaluator(f.workbook, sheet.id),
      (id) => f.workbook.sheets.get(id),
    );
  return {
    categories: data.categories,
    series: data.series.map(({ name, values, numberFormat }) => ({ name, values, numberFormat })),
  };
}

describe("native chart object clipboard transactions", () => {
  test.each(["copy", "cut"] as const)(
    "percentage presentation survives cross-sheet %s with live source and exact Undo",
    (mode) => {
      const f = fixture("line");
      try {
        const original = drawing(f.source);
        original.chart.stacked = true;
        original.chart.presentation = {
          percentStacked: true,
          lineMarkers: false,
          palette: ["#ffccaa", "#33aabb"],
          background: "#202936",
        };
        const appearance = structuredClone(original.chart.presentation);
        const expected = presentation(f, f.source);
        expect(f.clipboard[mode]()).toBe(true);
        f.navigate();
        const before = snapshot(f);
        expect(f.clipboard.paste()).toBe(true);
        expect(drawing(f.target).chart.presentation).toEqual(appearance);
        expect(presentation(f, f.target)).toEqual(expected);
        expect(drawing(f.target).chart.source?.series).toHaveLength(2);
        const after = snapshot(f);
        expect(serializeWorkbook(deserializeWorkbook(after))).toEqual(after);
        expect(undoWorkbookCommand(f.session)).toBe(true);
        expect(snapshot(f)).toEqual(before);
        expect(redoWorkbookCommand(f.session)).toBe(true);
        expect(snapshot(f)).toEqual(after);
        setCellValue(f.source, { row: 1, column: 1 }, 99);
        expect(presentation(f, f.target).series[0]!.values[0]).toBe(99);
        expect(drawing(f.target).chart.presentation).toEqual(appearance);
      } finally {
        f.scope.stop();
      }
    },
  );
  test.each(allTypes)(
    "same-sheet %s copy retains full source/styles and gets only fresh outer identity",
    (type) => {
      const f = fixture(type);
      try {
        const original = drawing(f.source),
          payload = structuredClone(original.chart),
          before = snapshot(f);
        expect(isDrawingClipboardEligibleRoot(original)).toBe(true);
        expect(isShapeGroupEligibleRoot(original)).toBe(false);
        expect(f.clipboard.copy()).toBe(true);
        expect(f.execute).not.toHaveBeenCalled();
        expect(f.clipboard.paste()).toBe(true);
        const pasted = drawing(f.source, 1);
        expect(pasted.id).toBe("fresh-1");
        expect(pasted.chart).toEqual(payload);
        expect(pasted.chart).not.toBe(original.chart);
        expect(pasted.rotation).toBe(37);
        expect(pasted.width).toBe(480);
        expect(pasted.height).toBe(300);
        expect(
          resolveDrawingClipboardRootLayout(pasted, createPictureSheetMetrics(f.source)).rect,
        ).toMatchObject({
          x: createPictureSheetMetrics(f.source).columns.visiblePrefix(3),
          y: createPictureSheetMetrics(f.source).rows.visiblePrefix(4),
          width: 480,
          height: 300,
        });
        expect(f.session.history.undoStack).toHaveLength(1);
        const after = snapshot(f);
        expect(serializeWorkbook(deserializeWorkbook(after))).toEqual(after);
        expect(undoWorkbookCommand(f.session)).toBe(true);
        expect(snapshot(f)).toEqual(before);
        expect(redoWorkbookCommand(f.session)).toBe(true);
        expect(snapshot(f)).toEqual(after);
      } finally {
        f.scope.stop();
      }
    },
  );
  test.each(["copy", "cut"] as const)(
    "cross-sheet %s promotes source refs instead of retargeting or freezing data",
    (mode) => {
      const f = fixture();
      try {
        const expected = presentation(f, f.source),
          original = structuredClone(drawing(f.source));
        expect(f.clipboard[mode]()).toBe(true);
        const identity = f.clipboard.getIdentity();
        f.navigate();
        const before = snapshot(f);
        expect(f.clipboard.paste()).toBe(true);
        expect(presentation(f, f.target)).toEqual(expected);
        const pasted = drawing(f.target);
        expect(pasted.chart.source).toMatchObject({
          kind: "series",
          categories: { kind: "range", sheetId: "source" },
        });
        expect(pasted.chart.dataCache).toBeUndefined();
        expect(pasted.chart.format).toEqual(original.chart.format);
        expect(f.source.drawings).toHaveLength(mode === "cut" ? 0 : 1);
        expect(f.session.history.undoStack).toHaveLength(1);
        expect(f.clipboard.getIdentity()).toEqual(mode === "cut" ? undefined : identity);
        const after = snapshot(f);
        expect(undoWorkbookCommand(f.session)).toBe(true);
        expect(snapshot(f)).toEqual(before);
        expect(redoWorkbookCommand(f.session)).toBe(true);
        expect(snapshot(f)).toEqual(after);
        setCellValue(f.source, { row: 1, column: 1 }, 99);
        expect(presentation(f, f.target).series[0]!.values[0]).toBe(99);
      } finally {
        f.scope.stop();
      }
    },
  );
  test.each([
    "pie",
    "doughnut",
    "scatter",
    "treemap",
    "sankey",
    "river",
    "wordCloud",
  ] as ChartType[])(
    "unsafe legacy cross-sheet %s cut stays pending and mutates neither forest",
    (type) => {
      const f = fixture(type);
      try {
        expect(f.clipboard.cut()).toBe(true);
        const identity = f.clipboard.getIdentity();
        f.navigate();
        const before = snapshot(f);
        expect(f.clipboard.paste()).toBe(false);
        expect(snapshot(f)).toEqual(before);
        expect(f.clipboard.getIdentity()).toEqual(identity);
        expect(f.session.history.undoStack).toHaveLength(0);
        expect(f.execute).not.toHaveBeenCalled();
      } finally {
        f.scope.stop();
      }
    },
  );
  test("cross-sheet chart source planning is mandatory even when host omitted hook", () => {
    const f = fixture("column", false);
    try {
      expect(f.clipboard.copy()).toBe(true);
      f.navigate();
      const before = snapshot(f);
      expect(f.clipboard.paste()).toBe(false);
      expect(snapshot(f)).toEqual(before);
      expect(f.execute).not.toHaveBeenCalled();
    } finally {
      f.scope.stop();
    }
  });
  test.each([
    { where: "same-sheet", mutate: false },
    { where: "cross-sheet", mutate: false },
    { where: "same-sheet", mutate: true },
    { where: "cross-sheet", mutate: true },
  ])(
    "$where preparation (mutate=$mutate) cannot silently rewrite chart source/format",
    ({ where, mutate }) => {
      const f = fixture();
      try {
        expect(f.clipboard.cut()).toBe(true);
        if (where === "cross-sheet") f.navigate();
        const before = snapshot(f),
          identity = f.clipboard.getIdentity();
        const corrupt = (node: SheetDrawing): SheetDrawing => {
          if (node.kind !== "chart") return node;
          if (mutate) {
            node.chart.title = "Dropped original source";
            delete node.chart.source;
            return node;
          }
          return {
            ...node,
            chart: { ...node.chart, title: "Dropped original source", source: undefined },
          };
        };
        if (where === "cross-sheet")
          f.prepareTransfer.mockImplementation((_sheet, _metrics, node) => corrupt(node));
        else f.prepareDrawing.mockImplementation(corrupt);
        expect(f.clipboard.paste()).toBe(false);
        expect(snapshot(f)).toEqual(before);
        expect(f.clipboard.getIdentity()).toEqual(identity);
        expect(f.session.history.undoStack).toHaveLength(0);
      } finally {
        f.scope.stop();
      }
    },
  );
  test.each(["source", "target"])(
    "%s protection refuses copy/cut transfer without any history or clipboard loss",
    (which) => {
      const f = fixture();
      try {
        expect(f.clipboard.cut()).toBe(true);
        const identity = f.clipboard.getIdentity();
        f.navigate();
        const protectedSheet = which === "source" ? f.source : f.target;
        protectedSheet.properties.protected = true;
        protectedSheet.protection = { editableRanges: [] };
        const before = snapshot(f);
        expect(f.clipboard.paste()).toBe(false);
        expect(snapshot(f)).toEqual(before);
        expect(f.clipboard.getIdentity()).toEqual(identity);
        expect(f.execute).not.toHaveBeenCalled();
      } finally {
        f.scope.stop();
      }
    },
  );
  test("rejected two-sheet command keeps delayed cut, then successful retry makes exactly one transaction", () => {
    const f = fixture();
    try {
      expect(f.clipboard.cut()).toBe(true);
      f.navigate();
      const before = snapshot(f),
        identity = f.clipboard.getIdentity();
      f.replaceCollections.mockReturnValueOnce(false);
      expect(f.clipboard.paste()).toBe(false);
      expect(snapshot(f)).toEqual(before);
      expect(f.clipboard.getIdentity()).toEqual(identity);
      expect(f.clipboard.paste()).toBe(true);
      expect(f.session.history.undoStack).toHaveLength(1);
      expect(f.source.drawings).toHaveLength(0);
    } finally {
      f.scope.stop();
    }
  });
  test.each(["copy", "cut", "paste"] as const)(
    "%s refuses Chart accessors before calling them",
    (mode) => {
      const f = fixture();
      try {
        if (mode === "paste") {
          expect(f.clipboard.copy()).toBe(true);
          f.navigate();
          f.target.drawings = [chart()];
        }
        const source = mode === "paste" ? f.target : f.source;
        const owner = source.drawings![0]!;
        if (owner.kind !== "chart") throw Error("Missing Chart");
        const getter = vi.fn(() => "column");
        Object.defineProperty(owner.chart, "type", {
          enumerable: true,
          configurable: true,
          get: getter,
        });
        const identity = f.clipboard.getIdentity();
        expect(f.clipboard[mode]()).toBe(false);
        expect(getter).not.toHaveBeenCalled();
        expect(source.drawings![0]).toBe(owner);
        expect(f.clipboard.getIdentity()).toEqual(identity);
        expect(f.execute).not.toHaveBeenCalled();
        expect(f.session.history.undoStack).toHaveLength(0);
      } finally {
        f.scope.stop();
      }
    },
  );
  test.each(["getter", "method"])("cache %s input is refused without execution", (kind) => {
    const f = fixture();
    try {
      const owner = drawing(f.source);
      owner.chart.range = null;
      owner.chart.dataCache = {
        categories: ["East"],
        series: [{ name: "A", values: [1] }],
        records: [["East", 1]],
      };
      const callback = vi.fn(() => "East");
      if (kind === "getter")
        Object.defineProperty(owner.chart.dataCache.categories, "0", {
          enumerable: true,
          configurable: true,
          get: callback,
        });
      else
        Object.defineProperty(owner.chart.dataCache.categories, "map", {
          enumerable: true,
          configurable: true,
          value: callback,
        });
      expect(f.clipboard.copy()).toBe(false);
      expect(callback).not.toHaveBeenCalled();
      expect(f.source.drawings![0]).toBe(owner);
      expect(f.execute).not.toHaveBeenCalled();
    } finally {
      f.scope.stop();
    }
  });
  test.each(["title", "source", "geometry"])("source-only host cannot rewrite %s", (change) => {
    const f = fixture();
    try {
      expect(f.clipboard.cut()).toBe(true);
      f.navigate();
      const before = snapshot(f),
        identity = f.clipboard.getIdentity();
      const original = f.prepareRootsForTarget.getMockImplementation()!;
      f.prepareRootsForTarget.mockImplementation((roots, sourceSheet, targetSheet) =>
        original(roots, sourceSheet, targetSheet).map((root) => {
          if (root.kind !== "chart") return root;
          if (change === "title") root.chart.title = "Changed by source planner";
          else if (change === "geometry") root.width++;
          else if (root.chart.source?.categories.kind === "range")
            root.chart.source.categories.sheetId = targetSheet.id;
          return root;
        }),
      );
      expect(f.clipboard.paste()).toBe(false);
      expect(snapshot(f)).toEqual(before);
      expect(f.clipboard.getIdentity()).toEqual(identity);
      expect(f.execute).not.toHaveBeenCalled();
    } finally {
      f.scope.stop();
    }
  });
  test("in-place target geometry change invalidates cached axis placement", () => {
    const f = fixture();
    try {
      expect(f.clipboard.cut()).toBe(true);
      f.navigate();
      const identity = f.clipboard.getIdentity(),
        oldSource = f.source.drawings,
        oldTarget = f.target.drawings;
      f.prepareTransfer.mockImplementation((_sheet, _metrics, node) => {
        f.target.columnWidths.set(0, 150);
        return node;
      });
      expect(f.clipboard.paste()).toBe(false);
      expect(f.source.drawings).toBe(oldSource);
      expect(f.target.drawings).toBe(oldTarget);
      expect(f.target.columnWidths.get(0)).toBe(150);
      expect(f.clipboard.getIdentity()).toEqual(identity);
      expect(f.execute).not.toHaveBeenCalled();
    } finally {
      f.scope.stop();
    }
  });
  test.each(["one-sheet", "two-sheet"])(
    "%s preparation owner is detached before a failed host",
    (where) => {
      const f = fixture();
      try {
        const original = drawing(f.source),
          before = snapshot(f);
        const next = { ...original, chart: { ...original.chart, title: "Intended change" } };
        const corruptOwner = (_node: SheetDrawing, owner?: SheetDrawing): SheetDrawing => {
          if (owner?.kind === "chart") owner.chart.title = "Mutated live owner";
          throw Error("Preparation failed");
        };
        if (where === "one-sheet") {
          f.prepareDrawing.mockImplementation(corruptOwner);
          expect(f.actions.replaceCollection([next], f.source.drawings!)).toBe(false);
        } else {
          f.prepareTransfer.mockImplementation((_sheet, _metrics, node, owner) =>
            corruptOwner(node, owner),
          );
          expect(
            f.transfer.replaceCollections(
              [
                {
                  sheet: f.source,
                  expected: f.source.drawings!,
                  next: [next],
                  metrics: createPictureSheetMetrics(f.source),
                },
                {
                  sheet: f.target,
                  expected: [],
                  next: [],
                  metrics: createPictureSheetMetrics(f.target),
                },
              ],
              () => true,
            ),
          ).toBe(false);
        }
        expect(snapshot(f)).toEqual(before);
        expect(f.source.drawings![0]).toBe(original);
        expect(f.execute).not.toHaveBeenCalled();
      } finally {
        f.scope.stop();
      }
    },
  );
  test("later collection preparation cannot mutate the first prepared Chart", () => {
    const f = fixture();
    try {
      const original = drawing(f.source),
        before = snapshot(f);
      let retained: SheetChartDrawing | undefined;
      f.prepareTransfer.mockImplementation((sheet, _metrics, node) => {
        if (node.kind !== "chart") return node;
        if (sheet === f.source) retained = node;
        else if (retained) retained.chart.title = "Late mutation";
        return node;
      });
      expect(
        f.transfer.replaceCollections(
          [
            {
              sheet: f.source,
              expected: f.source.drawings!,
              next: [{ ...original, chart: { ...original.chart, title: "Intended change" } }],
              metrics: createPictureSheetMetrics(f.source),
            },
            {
              sheet: f.target,
              expected: [],
              next: [{ ...original, id: "new-target" }],
              metrics: createPictureSheetMetrics(f.target),
            },
          ],
          () => true,
        ),
      ).toBe(false);
      expect(snapshot(f)).toEqual(before);
      expect(f.execute).not.toHaveBeenCalled();
    } finally {
      f.scope.stop();
    }
  });
  test("a host cannot bypass Pivot provenance by returning an unchanged null-range Chart", () => {
    const f = fixture();
    try {
      const original = drawing(f.source);
      original.chart.range = null;
      original.chart.pivotTableId = "pivot";
      expect(f.clipboard.copy()).toBe(true);
      f.navigate();
      const before = snapshot(f);
      f.prepareRootsForTarget.mockImplementation((roots) => [...roots]);
      expect(f.clipboard.paste()).toBe(false);
      expect(snapshot(f)).toEqual(before);
      expect(f.execute).not.toHaveBeenCalled();
    } finally {
      f.scope.stop();
    }
  });
});
