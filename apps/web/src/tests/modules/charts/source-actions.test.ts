import { effectScope, ref, shallowRef, type EffectScope } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { createChartSourceFromRange, type ChartSeriesSource } from "@sheetcraft/core/chart-source";
import { createSetSheetDrawingsCommand } from "@sheetcraft/core/commands";
import { getSheetChartData } from "@sheetcraft/core/sheet-charts";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import { deserializeWorkbook, serializeWorkbook } from "@sheetcraft/core/serialization";
import {
  createSheet,
  createWorkbookEvaluator,
  getActiveSheet,
  insertSheet,
  setCellContent,
  type Workbook,
} from "@sheetcraft/core/workbook";
import { reconcileChartRangeSeriesForRange } from "@sheetcraft/core/chart-range-series";
import {
  createChartSourceCandidate,
  planChartSourceVisibility,
  type ChartSourceVisibilityProof,
} from "../../../modules/charts/chart-source-editor";
import { useChartSourceActions } from "../../../modules/charts/useChartSourceActions";

const scopes: EffectScope[] = [];
afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop();
});
function drawing(id = "chart-one"): SheetChartDrawing {
  return {
    id,
    kind: "chart",
    name: "Sales",
    anchor: { row: 5, column: 0 },
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
      labels: true,
      stacked: false,
      showHidden: false,
      elements: { titlePosition: "overlay", legendPosition: "right", labelPosition: "outsideEnd" },
    },
  };
}
function fixture(withBindings = false) {
  const session = createWorkbookSession({ idFactory: createSequentialIdFactory() });
  const workbook = shallowRef<Workbook>(session.workbook);
  const sheet = shallowRef(getActiveSheet(workbook.value));
  const ownerSheet = sheet.value;
  const otherSheet = createSheet("Other Sheet", "other");
  insertSheet(workbook.value, otherSheet);
  for (const target of [ownerSheet, otherSheet]) {
    [
      ["Region", "Apple", "Pear"],
      ["East", 10, 11],
      ["West", 20, 21],
      ["North", 30, 31],
    ].forEach((row, r) =>
      row.forEach((value, column) =>
        setCellContent(target, { row: r, column }, { kind: "literal", value }),
      ),
    );
  }
  const first = drawing(),
    other = drawing("chart-two");
  if (withBindings) {
    first.chart.rectangleSeries = {
      rows: [{ index: 2, id: "row-style" }],
      columns: [
        { index: 0, id: "header-style" },
        { index: 1, id: "apple-style" },
        { index: 2, id: "pear-style" },
      ],
    };
    first.chart.format = {
      series: [
        { id: "row-style", color: "#112233" },
        { id: "header-style", color: "#223344" },
        { id: "apple-style", color: "#ff0000" },
        { id: "pear-style", color: "#00ff00" },
        { id: "dormant-style", color: "#0000ff" },
      ],
    };
  }
  ownerSheet.drawings = [first, other];
  // Same ID on a different sheet must never satisfy the captured chart owner.
  otherSheet.drawings = [drawing()];
  const generation = ref(1),
    revision = ref(0),
    busy = ref(false);
  const flush = vi.fn(() => true);
  const selectReference = vi.fn(
    async (_value: string, _role: string): Promise<string | undefined> => undefined,
  );
  const selectSheet = vi.fn((id: string) => {
    sheet.value = workbook.value.sheets.get(id)!;
  });
  const selectDrawing = vi.fn();
  const execute = vi.fn((command: Parameters<typeof executeWorkbookCommand>[1]) => {
    const changed = executeWorkbookCommand(session, command);
    if (changed) revision.value++;
    return changed;
  });
  const scope = effectScope();
  scopes.push(scope);
  const actions = scope.run(() =>
    useChartSourceActions({
      getWorkbook: () => workbook.value,
      getSheet: () => sheet.value,
      getGeneration: () => generation.value,
      getRevision: () => revision.value,
      getEvaluator: () => createWorkbookEvaluator(workbook.value, sheet.value.id),
      isBusy: () => busy.value,
      flush,
      execute,
      selectSheet,
      selectDrawing,
      selectReference,
    }),
  )!;
  const current = () => {
    const chart = ownerSheet.drawings?.find((item) => item.id === first.id);
    if (!chart || chart.kind !== "chart") throw new Error("Missing owner chart");
    return chart;
  };
  const candidate = (source = createChartSourceFromRange(ownerSheet.id, first.chart)) => ({
    ...first,
    chart: createChartSourceCandidate(first.chart, source),
  });
  function open() {
    actions.edit(current());
    expect(actions.dialog.value).toBeDefined();
    return actions.dialog.value!;
  }
  return {
    session,
    workbook,
    sheet,
    ownerSheet,
    otherSheet,
    generation,
    revision,
    busy,
    flush,
    execute,
    selectSheet,
    selectDrawing,
    selectReference,
    scope,
    actions,
    first,
    other,
    current,
    candidate,
    open,
  };
}

describe("chart source captured owner actions", () => {
  test("stages one detached source command, preserving chart fields and exact UndoRedo", () => {
    const f = fixture(),
      owner = f.open(),
      before = serializeWorkbook(f.workbook.value);
    const draft = f.candidate();
    draft.chart.source.series.reverse();
    expect(owner.commit(draft)).toBe(true);
    expect(f.current().chart.source).toEqual(draft.chart.source);
    expect({ ...f.current(), chart: f.first.chart }).toEqual(f.first);
    expect(f.ownerSheet.drawings?.[1]).toEqual(f.other);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(f.actions.dialog.value).toBeUndefined();
    expect(owner.commit(draft)).toBe(false);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    f.revision.value++;
    expect(serializeWorkbook(f.workbook.value)).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    f.revision.value++;
    expect(f.current().chart.source?.series.map((entry) => [entry.id, entry.colorIndex])).toEqual([
      ["series-2", 1],
      ["series-1", 0],
    ]);
  });

  test("no-op closes successfully without consuming an existing redo branch", () => {
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
    const redo = [...f.session.history.redoStack];
    const before = serializeWorkbook(f.workbook.value);
    const owner = f.open();
    f.execute.mockClear();
    expect(owner.commit({ ...f.current(), chart: { ...f.current().chart } })).toBe(true);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(f.session.history.redoStack).toEqual(redo);
    expect(serializeWorkbook(f.workbook.value)).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(f.current().chart.title).toBe("Undo me");
  });

  test("execute false retains the same draft owner/source/history and retry can succeed once", () => {
    const f = fixture(),
      owner = f.open(),
      draft = f.candidate();
    const before = serializeWorkbook(f.workbook.value);
    f.execute.mockImplementationOnce(() => false);
    expect(owner.commit(draft)).toBe(false);
    expect(f.actions.dialog.value).toBe(owner);
    expect(f.actions.error.value).toBe(true);
    expect(serializeWorkbook(f.workbook.value)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(draft.chart.source.series).toHaveLength(2);
    expect(owner.commit(draft)).toBe(true);
    expect(f.session.history.undoStack).toHaveLength(1);
  });

  test.each(["geometry", "identity", "title", "type", "elements", "legend"] as const)(
    "rejects unrelated candidate %s changes without altering the owner",
    (field) => {
      const f = fixture(),
        owner = f.open(),
        draft = f.candidate();
      const before = serializeWorkbook(f.workbook.value);
      if (field === "geometry") draft.width++;
      if (field === "identity") draft.id = "chart-two";
      if (field === "title") draft.chart.title = "Rogue";
      if (field === "type") draft.chart.type = "line";
      if (field === "elements") draft.chart.elements = { legendPosition: "left" };
      if (field === "legend") draft.chart.legend = false;
      expect(owner.commit(draft)).toBe(false);
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.actions.dialog.value).toBe(owner);
      expect(f.actions.error.value).toBe(true);
      expect(serializeWorkbook(f.workbook.value)).toEqual(before);
    },
  );

  test.each(["deleted-sheet", "tombstone", "length-mismatch"] as const)(
    "rejects derived %s source diagnostics and retains the source dialog",
    (kind) => {
      const f = fixture(),
        owner = f.open(),
        draft = f.candidate();
      const source = draft.chart.source;
      if (kind === "deleted-sheet")
        source.series[0]!.values = {
          kind: "range",
          sheetId: "missing",
          range: { start: { row: 1, column: 1 }, end: { row: 3, column: 1 } },
        };
      if (kind === "tombstone")
        source.series[0]!.values = { kind: "range", sheetId: f.ownerSheet.id, range: null };
      if (kind === "length-mismatch") source.series[0]!.values = { kind: "literal", values: [99] };
      const before = serializeWorkbook(f.workbook.value);
      expect(owner.commit(draft)).toBe(false);
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.actions.dialog.value).toBe(owner);
      expect(serializeWorkbook(f.workbook.value)).toEqual(before);
    },
  );

  test("zero-series source deliberately retains a blank chart and one reversible edit", () => {
    const f = fixture(),
      owner = f.open(),
      draft = f.candidate();
    draft.chart.source.series = [];
    expect(owner.commit(draft)).toBe(true);
    expect(f.ownerSheet.drawings).toHaveLength(2);
    expect(
      getSheetChartData(
        f.ownerSheet,
        f.current().chart,
        createWorkbookEvaluator(f.workbook.value, f.ownerSheet.id),
        (id) => f.workbook.value.sheets.get(id),
      ).series,
    ).toEqual([]);
    expect(f.current().chart.source?.series).toEqual([]);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(f.current().chart.source).toBeUndefined();
  });

  test("protected external source is readable, while owner editObjects permission still guards writes", () => {
    const f = fixture();
    f.otherSheet.properties.protected = true;
    const source: ChartSeriesSource = createChartSourceFromRange(f.otherSheet.id, f.first.chart);
    expect(f.open().commit(f.candidate(source))).toBe(true);
    expect(
      getSheetChartData(
        f.ownerSheet,
        f.current().chart,
        createWorkbookEvaluator(f.workbook.value, f.ownerSheet.id),
        (id) => f.workbook.value.sheets.get(id),
      ).series[0]?.values,
    ).toEqual([10, 20, 30]);
    const owner = f.open();
    f.ownerSheet.properties.protected = true;
    const before = serializeWorkbook(f.workbook.value);
    expect(
      owner.commit({ ...f.current(), chart: { ...f.current().chart, showHidden: true } }),
    ).toBe(false);
    expect(serializeWorkbook(f.workbook.value)).toEqual(before);
    expect(f.current().chart.showHidden).toBe(false);
    expect(f.session.history.undoStack).toHaveLength(1);
  });

  test("picker can visit a different sheet, accepts its reference, and restores the captured owner tab", async () => {
    const f = fixture(),
      owner = f.open();
    let finish!: (value: string) => void;
    f.selectReference.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = owner.selectReference("A1:B4", "series-values");
    f.sheet.value = f.otherSheet;
    expect(owner.isCurrent()).toBe(true);
    expect(owner.commit(f.candidate())).toBe(false);
    finish("='Other Sheet'!$B$2:$B$4");
    expect(await pending).toBe("='Other Sheet'!$B$2:$B$4");
    expect(f.selectSheet).toHaveBeenCalledExactlyOnceWith(f.ownerSheet.id);
    expect(f.selectDrawing).toHaveBeenCalledExactlyOnceWith(f.first.id);
    expect(f.sheet.value).toBe(f.ownerSheet);
    expect(f.actions.dialog.value).toBe(owner);
    expect(f.session.history.undoStack).toHaveLength(0);
  });

  test.each(["delete", "same-id", "generation", "book", "dispose"] as const)(
    "late picker/captured commit cannot retarget after %s",
    async (kind) => {
      const f = fixture(),
        owner = f.open();
      let finish!: (value: string) => void;
      f.selectReference.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const pending = owner.selectReference("A1:B4", "source");
      f.sheet.value = f.otherSheet;
      if (kind === "delete") f.ownerSheet.drawings = [f.other];
      if (kind === "same-id")
        f.ownerSheet.drawings = [{ ...f.first, chart: { ...f.first.chart } }, f.other];
      if (kind === "generation") f.generation.value++;
      if (kind === "book")
        f.workbook.value = createWorkbookSession({
          idFactory: createSequentialIdFactory(),
        }).workbook;
      if (kind === "dispose") f.scope.stop();
      f.revision.value++;
      const before = serializeWorkbook(f.workbook.value);
      finish("='Other Sheet'!$A$1:$C$4");
      expect(await pending).toBeUndefined();
      expect(f.selectSheet).not.toHaveBeenCalled();
      expect(f.selectDrawing).not.toHaveBeenCalled();
      expect(owner.commit(f.candidate())).toBe(false);
      owner.close();
      expect(f.execute).not.toHaveBeenCalled();
      expect(serializeWorkbook(f.workbook.value)).toEqual(before);
    },
  );

  test("permission revoked during picker discards its late result and cannot commit", async () => {
    const f = fixture(),
      owner = f.open();
    let finish!: (value: string) => void;
    f.selectReference.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = owner.selectReference("A1:B4", "source");
    f.sheet.value = f.otherSheet;
    f.ownerSheet.properties.protected = true;
    finish("='Other Sheet'!$A$1:$C$4");
    expect(await pending).toBeUndefined();
    expect(f.selectSheet).not.toHaveBeenCalled();
    expect(f.selectDrawing).not.toHaveBeenCalled();
    expect(owner.commit(f.candidate())).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.current()).toBe(f.first);
  });

  test.each(["sheet", "generation", "replacement", "permission", "false", "throw"] as const)(
    "preparation refuses safely when flush causes %s",
    (kind) => {
      const f = fixture(),
        owner = f.open();
      f.flush.mockImplementationOnce(() => {
        if (kind === "sheet") f.sheet.value = f.otherSheet;
        if (kind === "generation") f.generation.value++;
        if (kind === "replacement")
          f.ownerSheet.drawings = [{ ...f.first, chart: { ...f.first.chart } }, f.other];
        if (kind === "permission") f.ownerSheet.properties.protected = true;
        if (kind === "throw") throw new Error("flush refused");
        return kind !== "false";
      });
      expect(owner.commit(f.candidate())).toBe(false);
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.session.history.undoStack).toHaveLength(0);
    },
  );

  test("same-owner callbacks and reentrant flush cannot create a second command or replace the draft", () => {
    const f = fixture(),
      owner = f.open(),
      draft = f.candidate();
    f.flush.mockImplementationOnce(() => {
      expect(owner.commit(draft)).toBe(false);
      f.actions.edit(f.other);
      expect(f.actions.dialog.value).toBe(owner);
      return true;
    });
    expect(owner.commit(draft)).toBe(true);
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(owner.commit(draft)).toBe(false);
  });

  test("a prior dialog's close, commit and picker cannot dismiss or alter its newer owner", async () => {
    const f = fixture(),
      old = f.open();
    f.actions.edit(f.other);
    const next = f.actions.dialog.value!;
    expect(next).not.toBe(old);
    old.close();
    expect(f.actions.dialog.value).toBe(next);
    expect(old.commit(f.candidate())).toBe(false);
    expect(await old.selectReference("A1:B4", "source")).toBeUndefined();
    expect(f.selectReference).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.actions.dialog.value).toBe(next);
    expect(next.initial).toBe(f.other);
  });

  test("opening a source dialog catches a throwing flush and reentrant opening keeps one owner", () => {
    const f = fixture();
    f.flush.mockImplementationOnce(() => {
      throw new Error("flush refused");
    });
    expect(() => f.actions.edit(f.first)).not.toThrow();
    expect(f.actions.dialog.value).toBeUndefined();
    f.flush.mockImplementationOnce(() => {
      f.actions.edit(f.other);
      return true;
    });
    f.actions.edit(f.first);
    expect(f.actions.dialog.value?.initial).toBe(f.first);
    expect(f.execute).not.toHaveBeenCalled();
  });
});

describe("active chart data table source budget", () => {
  test("a source edit that exceeds complete table budget keeps the draft and both history branches", () => {
    const f = fixture();
    f.ownerSheet.drawings = [
      {
        ...f.first,
        chart: {
          ...f.first.chart,
          elements: { ...f.first.chart.elements, dataTable: "withLegendKeys" },
        },
      },
      f.other,
    ];
    f.revision.value++;
    const owner = f.open(),
      before = serializeWorkbook(f.workbook.value);
    const categories = Array.from({ length: 33 }, (_, i) => `category${i}`);
    const draft: SheetChartDrawing = {
      ...owner.initial,
      chart: {
        ...owner.initial.chart,
        range: null,
        source: {
          kind: "series",
          categories: { kind: "generated" },
          series: [
            {
              id: "series-1",
              colorIndex: 0,
              name: { kind: "literal", text: "Apple" },
              values: { kind: "literal", values: categories.map(() => 1) },
            },
          ],
        },
      },
    };
    expect(owner.commit(draft)).toBe(false);
    expect(f.actions.dialog.value).toBe(owner);
    expect(f.actions.error.value).toBe(true);
    expect(f.execute).not.toHaveBeenCalled();
    expect(serializeWorkbook(f.workbook.value)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(f.session.history.redoStack).toHaveLength(0);
  });
});

describe("source action rectangular identity authority", () => {
  test("same-range Cancel and final restored draft leave identity and history unchanged", () => {
    const f = fixture(true),
      before = serializeWorkbook(f.workbook.value);
    f.open().close();
    expect(serializeWorkbook(f.workbook.value)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
    const owner = f.open();
    expect(owner.commit(structuredClone(owner.initial))).toBe(true);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(serializeWorkbook(f.workbook.value)).toEqual(before);
  });

  test.each(["replace-id", "remove", "add", "move-band"] as const)(
    "rejects arbitrary %s metadata edits",
    (kind) => {
      const f = fixture(true),
        owner = f.open(),
        candidate = structuredClone(f.first);
      const before = serializeWorkbook(f.workbook.value);
      if (kind === "replace-id") candidate.chart.rectangleSeries!.columns[1]!.id = "dormant-style";
      if (kind === "remove") delete candidate.chart.rectangleSeries;
      if (kind === "add") candidate.chart.rectangleSeries!.rows.push({ index: 1, id: "arbitrary" });
      if (kind === "move-band") candidate.chart.rectangleSeries!.rows[0]!.index = 1;
      expect(owner.commit(candidate)).toBe(false);
      expect(f.actions.dialog.value).toBe(owner);
      expect(f.execute).not.toHaveBeenCalled();
      expect(serializeWorkbook(f.workbook.value)).toEqual(before);
    },
  );

  test("overlap reconciliation commits once and survives snapshot/UndoRedo exactly", () => {
    const f = fixture(true),
      owner = f.open(),
      before = serializeWorkbook(f.workbook.value);
    const range = { start: { row: 0, column: 0 }, end: { row: 3, column: 1 } };
    const candidate = {
      ...f.first,
      chart: reconcileChartRangeSeriesForRange(f.first.chart, range),
    };
    expect(owner.commit(candidate)).toBe(true);
    expect(f.current().chart.rectangleSeries).toEqual(candidate.chart.rectangleSeries);
    expect(f.current().chart.format).toEqual(f.first.chart.format);
    const after = serializeWorkbook(f.workbook.value);
    expect(after.version).toBe(83);
    expect(serializeWorkbook(deserializeWorkbook(after))).toEqual(after);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook.value)).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook.value)).toEqual(after);
  });

  test("disjoint range drops identities without dropping dormant formatting", () => {
    const f = fixture(true),
      owner = f.open();
    const range = { start: { row: 19, column: 0 }, end: { row: 22, column: 2 } };
    const candidate = {
      ...f.first,
      chart: reconcileChartRangeSeriesForRange(f.first.chart, range),
    };
    expect(owner.commit(candidate)).toBe(true);
    expect(f.current().chart.rectangleSeries).toBeUndefined();
    expect(f.current().chart.format).toEqual(f.first.chart.format);
  });

  test("bound promotion allows explicit name/values edits across sheets and keeps style seeds", () => {
    const f = fixture(true),
      owner = f.open(),
      candidate = f.candidate();
    candidate.chart.source!.series[0]!.name = { kind: "literal", text: "new name" };
    candidate.chart.source!.series[0]!.values = {
      kind: "range",
      sheetId: f.otherSheet.id,
      range: { start: { row: 1, column: 2 }, end: { row: 3, column: 2 } },
    };
    expect(owner.commit(candidate)).toBe(true);
    expect(f.current().chart.rectangleSeries).toBeUndefined();
    expect(f.current().chart.source?.series.map((entry) => entry.id)).toEqual([
      "apple-style",
      "pear-style",
    ]);
    expect(f.current().chart.format).toEqual(f.first.chart.format);
    expect(f.session.history.undoStack).toHaveLength(1);
  });

  test.each(["row-style", "header-style", "dormant-style"])(
    "promotion cannot activate unrelated %s",
    (id) => {
      const f = fixture(true),
        owner = f.open(),
        candidate = f.candidate();
      const before = serializeWorkbook(f.workbook.value);
      candidate.chart.source!.series[0]!.id = id;
      expect(owner.commit(candidate)).toBe(false);
      expect(f.execute).not.toHaveBeenCalled();
      expect(serializeWorkbook(f.workbook.value)).toEqual(before);
    },
  );

  test("a final direction change permits its active bound row and keeps column styles dormant", () => {
    const f = fixture(true),
      owner = f.open();
    const chart = { ...f.first.chart, seriesBy: "rows" as const };
    const candidate = {
      ...f.first,
      chart: createChartSourceCandidate(chart, createChartSourceFromRange(f.ownerSheet.id, chart)),
    };
    expect(owner.commit(candidate)).toBe(true);
    expect(f.current().chart.source?.series.map((entry) => entry.id)).toContain("row-style");
    expect(f.current().chart.source?.series.map((entry) => entry.id)).not.toContain("apple-style");
    expect(f.current().chart.format).toEqual(f.first.chart.format);
  });

  test.each(["protection", "stale-owner", "execute-false"] as const)(
    "identity source %s failure preserves exact state",
    (kind) => {
      const f = fixture(true),
        owner = f.open(),
        candidate = f.candidate();
      if (kind === "protection") f.ownerSheet.properties.protected = true;
      if (kind === "stale-owner") f.ownerSheet.drawings = [structuredClone(f.first), f.other];
      if (kind === "execute-false") f.execute.mockImplementationOnce(() => false);
      const before = serializeWorkbook(f.workbook.value);
      expect(owner.commit(candidate)).toBe(false);
      expect(serializeWorkbook(f.workbook.value)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
      if (kind === "execute-false") {
        expect(f.actions.dialog.value).toBe(owner);
        expect(owner.commit(candidate)).toBe(true);
        expect(f.session.history.undoStack).toHaveLength(1);
      }
    },
  );
});

describe("source visibility atomic owner proofs", () => {
  function hide(f: ReturnType<typeof fixture>, index = 2) {
    const base = structuredClone(f.current().chart);
    const proof: ChartSourceVisibilityProof = {
      base,
      changes: [{ rangeBand: { seriesBy: "columns", index }, visible: false }],
    };
    return {
      proof,
      candidate: { ...f.current(), chart: planChartSourceVisibility(base, proof.changes) },
    };
  }
  test("rectangle hide/show allocates only a real band, preserves all fields and has exact single-command UndoRedo", () => {
    const f = fixture(),
      owner = f.open(),
      before = serializeWorkbook(f.workbook.value);
    const { candidate, proof } = hide(f);
    expect(owner.commit(candidate, proof)).toBe(true);
    expect(f.current().chart.source).toBeUndefined();
    expect(f.current().chart.range).toEqual(f.first.chart.range);
    expect(f.current().chart.title).toBe("Sales");
    expect(f.current().chart.rectangleSeries).toEqual({
      rows: [],
      columns: [{ index: 2, id: "range-series-1" }],
    });
    expect(f.session.history.undoStack).toHaveLength(1);
    const hidden = serializeWorkbook(f.workbook.value);
    expect(hidden.version).toBe(84);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    f.revision.value++;
    expect(serializeWorkbook(f.workbook.value)).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    f.revision.value++;
    expect(serializeWorkbook(f.workbook.value)).toEqual(hidden);
    const showOwner = f.open(),
      base = structuredClone(f.current().chart);
    const show: ChartSourceVisibilityProof = {
      base,
      changes: [{ rangeBand: { seriesBy: "columns", index: 2 }, visible: true }],
    };
    expect(
      showOwner.commit(
        { ...f.current(), chart: planChartSourceVisibility(base, show.changes) },
        show,
      ),
    ).toBe(true);
    expect(f.current().chart.seriesFilter).toBeUndefined();
    expect(f.current().chart.rectangleSeries).toEqual(candidate.chart.rectangleSeries);
    expect(f.session.history.undoStack).toHaveLength(2);
  });
  test("hide then CRUD promotion transfers only planned seed IDs and keeps retired hidden filters reserved", () => {
    const f = fixture(),
      owner = f.open(),
      { candidate, proof } = hide(f);
    const source = createChartSourceFromRange(f.ownerSheet.id, candidate.chart);
    expect(source.series.map((entry) => entry.id)).toEqual(["series-1", "range-series-1"]);
    source.series.reverse();
    const promoted = { ...candidate, chart: createChartSourceCandidate(candidate.chart, source) };
    expect(owner.commit(promoted, proof)).toBe(true);
    expect(f.current().chart.source?.series.map((entry) => [entry.id, entry.colorIndex])).toEqual([
      ["range-series-1", 1],
      ["series-1", 0],
    ]);
    expect(f.current().chart.seriesFilter).toEqual(candidate.chart.seriesFilter);
    expect(f.current().chart.rectangleSeries).toBeUndefined();
    const removeOwner = f.open(),
      removed = structuredClone(f.current());
    removed.chart.source!.series.shift();
    expect(removeOwner.commit(removed)).toBe(true);
    expect(f.current().chart.seriesFilter?.hiddenSeriesIds).toEqual(["range-series-1"]);
  });
  test.each([
    "forged-base",
    "forged-id",
    "extra-binding",
    "unproved-filter",
    "dormant-source",
  ] as const)("rejects %s without command or history", (kind) => {
    const f = fixture(true),
      owner = f.open(),
      before = serializeWorkbook(f.workbook.value);
    const { candidate, proof } = hide(f);
    if (kind === "forged-base") proof.base.rectangleSeries!.columns[2]!.id = "dormant-style";
    if (kind === "forged-id") candidate.chart.rectangleSeries!.columns[2]!.id = "dormant-style";
    if (kind === "extra-binding")
      candidate.chart.rectangleSeries!.rows.push({ index: 1, id: "fresh" });
    if (kind === "unproved-filter")
      candidate.chart.seriesFilter!.hiddenSeriesIds.push("dormant-style");
    if (kind === "dormant-source") {
      const source = createChartSourceFromRange(f.ownerSheet.id, candidate.chart);
      source.series[0]!.id = "row-style";
      candidate.chart = createChartSourceCandidate(candidate.chart, source);
    }
    expect(owner.commit(candidate, proof)).toBe(false);
    expect(f.actions.dialog.value).toBe(owner);
    expect(f.execute).not.toHaveBeenCalled();
    expect(serializeWorkbook(f.workbook.value)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
  });
  test("getter-bearing proof does not execute the getter or replace the retained owner", () => {
    const f = fixture(),
      owner = f.open(),
      { candidate, proof } = hide(f);
    const getter = vi.fn(() => proof.changes);
    Object.defineProperty(proof, "changes", { get: getter });
    expect(owner.commit(candidate, proof)).toBe(false);
    expect(getter).not.toHaveBeenCalled();
    expect(f.actions.dialog.value).toBe(owner);
    expect(f.execute).not.toHaveBeenCalled();
  });
  test("all-hidden invalid definitions and complete raw table budgets cannot be bypassed by the filter", () => {
    const f = fixture(),
      owner = f.open(),
      invalid = f.candidate();
    invalid.chart.source.series[0]!.values = { kind: "range", sheetId: "missing", range: null };
    invalid.chart.seriesFilter = {
      hiddenSeriesIds: invalid.chart.source.series.map((entry) => entry.id),
    };
    expect(owner.commit(invalid)).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
    f.actions.close();
    f.ownerSheet.drawings = [
      {
        ...f.first,
        chart: {
          ...f.first.chart,
          elements: { ...f.first.chart.elements, dataTable: "withLegendKeys" },
        },
      },
      f.other,
    ];
    const tableOwner = f.open(),
      table = structuredClone(tableOwner.initial);
    table.chart = createChartSourceCandidate(table.chart, {
      kind: "series",
      categories: { kind: "generated" },
      series: Array.from({ length: 9 }, (_, index) => ({
        id: `extra-${index}`,
        colorIndex: index,
        name: { kind: "literal" as const, text: "entry" },
        values: { kind: "literal" as const, values: [1, 2, 3] },
      })),
    });
    table.chart.seriesFilter = {
      hiddenSeriesIds: table.chart.source!.series.map((entry) => entry.id),
    };
    expect(tableOwner.commit(table)).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.actions.dialog.value).toBe(tableOwner);
  });
});

test("captured explicit-empty filter exact no-op consumes no history or command", () => {
  const f = fixture();
  f.first.chart = createChartSourceCandidate(
    f.first.chart,
    createChartSourceFromRange(f.ownerSheet.id, f.first.chart),
  );
  f.first.chart.seriesFilter = { hiddenSeriesIds: [] };
  const before = serializeWorkbook(f.workbook.value),
    owner = f.open();
  expect(owner.commit(structuredClone(owner.initial))).toBe(true);
  expect(f.execute).not.toHaveBeenCalled();
  expect(f.session.history.undoStack).toHaveLength(0);
  expect(serializeWorkbook(f.workbook.value)).toEqual(before);
});
