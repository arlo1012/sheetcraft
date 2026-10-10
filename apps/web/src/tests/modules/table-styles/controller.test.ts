import { defineComponent, h, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  createBuiltinTableStyles,
  createThemedTableStyles,
  resolveTableCellStyle,
  type TableStyleDefinition,
} from "@sheetcraft/core/table-styles";
import type { PivotTableStyleDefinition } from "@sheetcraft/core/pivot-table-styles";
import { deserializeWorkbook, serializeWorkbook } from "@sheetcraft/core/serialization";
import { createWorkbook, getCellContent, setCellContent } from "@sheetcraft/core/workbook";
import { createSheetGridViewState } from "@sheetcraft/sheet-engine/view-state";
import { useSpreadsheetWorkspaceController } from "../../../app/composables/useSpreadsheetWorkspaceController";
import { useTableStylesController } from "../../../modules/table-styles/useTableStylesController";
import { createAppI18n } from "../../../shared/i18n";

let wrapper: ReturnType<typeof mount>;
function fixture(populated = true) {
  let workspace!: ReturnType<typeof useSpreadsheetWorkspaceController>;
  let tables!: ReturnType<typeof useTableStylesController>;
  wrapper = mount(
    defineComponent({
      setup() {
        workspace = useSpreadsheetWorkspaceController({ idFactory: createSequentialIdFactory() });
        tables = useTableStylesController({
          getWorkbook: () => workspace.session.workbook,
          getSheet: () => workspace.activeSheet.value,
          getAddress: () => workspace.activeAddress.value,
          getSelection: () => workspace.activeSelectionRange.value,
          getGeneration: () => workspace.workbookGeneration.value,
          getRevision: () => workspace.workbookRevision.value,
          isBusy: () => workspace.activeSheet.value.properties.protected,
          finishEditing: () => true,
          execute: workspace.executeCommand,
          focus: vi.fn(),
        });
        return () => h("div");
      },
    }),
    { global: { plugins: [createAppI18n("en-US")] } },
  );
  const sheet = workspace.activeSheet.value;
  for (const [row, values] of (populated
    ? [
        ["Region", "Amount"],
        ["East", 10],
        ["West", 20],
      ]
    : []
  ).entries())
    for (const [column, value] of values.entries())
      setCellContent(sheet, { row, column }, { kind: "literal", value });
  const start = { row: 0, column: 0 };
  workspace.updateActiveSheetViewState(
    createSheetGridViewState({
      selection: { active: start, anchor: start, focus: start, mode: "cells" },
    }),
  );
  return { workspace, tables, sheet };
}
afterEach(() => wrapper.unmount());

describe("table style workspace integration", () => {
  test("blank Insert defaults to generated headers and creates an undoable, serializable table", () => {
    const { workspace, tables, sheet } = fixture(false);
    // Appearance without content must still be treated as an empty source.
    sheet.cells.set("0:0", { style: { fillColor: "#ffffff" } });
    const before = serializeWorkbook(workspace.session.workbook);
    tables.requestCreate();
    expect(tables.createTarget.value?.intent).toBe("insert");
    expect(tables.createInitial.value).toEqual({
      range: "=Sheet1!$A$1",
      mode: "table",
      headerRows: 1,
      hasHeaders: false,
      filterButton: true,
    });
    tables.createTarget.value!.confirm(tables.createInitial.value!);
    expect(tables.modalOpen.value).toBe(false);
    expect(sheet.tables?.[0]).toMatchObject({
      name: "Table1",
      columns: [{ name: "Column1" }],
      headerRow: true,
      filterButton: true,
      range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
      filter: {
        range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
        columns: [],
      },
    });
    expect(getCellContent(sheet, { row: 0, column: 0 })).toMatchObject({ value: "Column1" });
    expect(workspace.session.history.undoStack).toHaveLength(1);
    const created = serializeWorkbook(workspace.session.workbook);
    const restored = deserializeWorkbook(created);
    expect(serializeWorkbook(restored)).toEqual(created);
    workspace.undo();
    expect(serializeWorkbook(workspace.session.workbook)).toEqual(before);
    workspace.redo();
    expect(serializeWorkbook(workspace.session.workbook)).toEqual(created);
  });

  test("an explicit empty selection ignores content elsewhere in the sheet", () => {
    const { workspace, tables } = fixture();
    workspace.updateActiveSheetViewState(
      createSheetGridViewState({
        selection: {
          active: { row: 0, column: 3 },
          anchor: { row: 0, column: 3 },
          focus: { row: 2, column: 4 },
          mode: "cells",
        },
      }),
    );
    tables.requestCreate();
    expect(tables.createInitial.value).toMatchObject({
      range: "=Sheet1!$D$1:$E$3",
      hasHeaders: false,
      filterButton: true,
    });
  });

  test("the observed populated A1:D7 fixture keeps checked headers and filter with user overrides", () => {
    const { workspace, tables, sheet } = fixture(false);
    [
      ["region", "product", "amount", "qty"],
      ["north", "apple", 100, 2],
      ["north", "pear", 80, 1],
      ["south", "apple", 120, 3],
      ["south", "pear", 90, 2],
      ["east", "apple", 60, 1],
      ["east", "pear", 70, 2],
    ].forEach((row, r) =>
      row.forEach((value, column) =>
        setCellContent(sheet, { row: r, column }, { kind: "literal", value }),
      ),
    );
    const before = serializeWorkbook(workspace.session.workbook);
    tables.requestCreate();
    expect(tables.createInitial.value).toMatchObject({
      range: "=Sheet1!$A$1:$D$7",
      hasHeaders: true,
      filterButton: true,
    });
    tables.confirmCreate({
      ...tables.createInitial.value!,
      hasHeaders: false,
      filterButton: false,
    });
    expect(sheet.tables?.[0]).toMatchObject({
      columns: [{ name: "Column1" }, { name: "Column2" }, { name: "Column3" }, { name: "Column4" }],
      filterButton: false,
      range: { end: { row: 7, column: 3 } },
      filter: { range: { end: { row: 7, column: 3 } }, columns: [] },
    });
    expect(getCellContent(sheet, { row: 1, column: 0 })).toMatchObject({ value: "region" });
    expect(getCellContent(sheet, { row: 7, column: 2 })).toMatchObject({ value: 70 });
    const restored = deserializeWorkbook(serializeWorkbook(workspace.session.workbook));
    expect([...restored.sheets.values()][0]?.tables).toEqual(sheet.tables);
    workspace.undo();
    expect(serializeWorkbook(workspace.session.workbook)).toEqual(before);
  });

  test("Insert does not restyle an existing table while gallery selection still does", () => {
    const { workspace, tables, sheet } = fixture();
    tables.requestCreate();
    tables.confirmCreate(tables.createInitial.value!);
    const before = serializeWorkbook(workspace.session.workbook);
    tables.requestCreate();
    expect(tables.modalOpen.value).toBe(false);
    expect(serializeWorkbook(workspace.session.workbook)).toEqual(before);
    expect(workspace.session.history.undoStack).toHaveLength(1);
    tables.applyStyle(createBuiltinTableStyles()[4]!);
    expect(sheet.tables?.[0]?.style.id).toBe(createBuiltinTableStyles()[4]!.id);
    expect(workspace.session.history.undoStack).toHaveLength(2);
  });

  test.each([0, 2])(
    "applies appearance only with %i header rows and reversible cell styles",
    (headerRows) => {
      const { workspace, tables, sheet } = fixture();
      const formula = { kind: "formula" as const, formula: { source: "=B2*2" } };
      setCellContent(sheet, { row: 2, column: 1 }, formula);
      const style: TableStyleDefinition = {
        id: "appearance",
        name: "Appearance",
        category: "custom",
        elements: {
          wholeTable: { style: { fillColor: "#ffffff" } },
          headerRow: { style: { fillColor: "#4f81bd", bold: true } },
          firstRowStripe: { style: { fillColor: "#d8e4bc" } },
        },
      };
      tables.applyStyle(style);
      expect(tables.createTarget.value?.intent).toBe("applyStyle");
      expect(tables.createInitial.value).toMatchObject({
        mode: "table",
        hasHeaders: true,
        filterButton: true,
      });
      tables.confirmCreate({ ...tables.createInitial.value!, mode: "styleOnly", headerRows });

      expect(tables.modalOpen.value).toBe(false);
      expect(sheet.tables).toEqual([]);
      expect(sheet.filter).toBeNull();
      expect(getCellContent(sheet, { row: 0, column: 0 })).toMatchObject({ value: "Region" });
      expect(getCellContent(sheet, { row: 2, column: 1 })).toEqual(formula);
      expect(sheet.cells.get("0:0")?.style?.fillColor).toBe(headerRows ? "#4f81bd" : "#d8e4bc");
      if (headerRows) expect(sheet.cells.get("1:0")?.style?.fillColor).toBe("#4f81bd");
      expect(workspace.session.history.undoStack).toHaveLength(1);
      workspace.undo();
      expect(sheet.cells.get("0:0")?.style).toBeUndefined();
      expect(getCellContent(sheet, { row: 2, column: 1 })).toEqual(formula);
      workspace.redo();
      const restored = deserializeWorkbook(serializeWorkbook(workspace.session.workbook));
      const restoredSheet = [...restored.sheets.values()][0]!;
      expect(restoredSheet.tables).toEqual([]);
      expect(restoredSheet.cells.get("0:0")?.style).toEqual(sheet.cells.get("0:0")?.style);
    },
  );

  test("enables colored first-column presets on creation and selection while keeping the toggle editable", () => {
    const { workspace, tables, sheet } = fixture();
    const presets = createThemedTableStyles("#c0504d");
    const highlighted = presets.find((style) => style.id === "table-wps-medium-3")!;
    const regular = presets.find((style) => style.id === "table-wps-medium-1")!;
    const firstCell = { row: 1, column: 0 };
    tables.applyStyle(highlighted);
    tables.confirmCreate({ ...tables.createInitial.value!, range: "A1:B3", hasHeaders: true });
    expect(sheet.tables?.[0]?.firstColumn).toBe(true);
    expect(resolveTableCellStyle(sheet.tables![0]!, firstCell)?.fillColor).toBe("#c0504d");
    tables.updateTable({ firstColumn: false });
    expect(resolveTableCellStyle(sheet.tables![0]!, firstCell)?.fillColor).not.toBe("#c0504d");
    tables.applyStyle(regular);
    expect(sheet.tables?.[0]?.firstColumn).toBe(false);
    tables.applyStyle(highlighted);
    expect(sheet.tables?.[0]?.firstColumn).toBe(true);
    workspace.undo();
    expect(sheet.tables?.[0]).toMatchObject({ firstColumn: false, style: { id: regular.id } });
    workspace.redo();
    expect(sheet.tables?.[0]?.firstColumn).toBe(true);
    tables.applyStyle(regular);
    expect(sheet.tables?.[0]?.firstColumn).toBe(true);
  });

  test("creates a table with filter buttons disabled", () => {
    const { workspace, tables, sheet } = fixture();
    tables.requestCreate();
    tables.confirmCreate({ ...tables.createInitial.value!, filterButton: false });
    expect(tables.modalOpen.value).toBe(false);
    expect(sheet.tables?.[0]).toMatchObject({ headerRow: true, filterButton: false });
    expect(workspace.session.history.undoStack).toHaveLength(1);
    workspace.undo();
    expect(sheet.tables).toEqual([]);
    workspace.redo();
    expect(sheet.tables?.[0]?.filterButton).toBe(false);
  });

  test("keeps an invalid header count in the dialog without applying partial formatting", () => {
    const { workspace, tables, sheet } = fixture();
    tables.requestCreate();
    tables.confirmCreate({ ...tables.createInitial.value!, mode: "styleOnly", headerRows: 4 });
    expect(tables.modalOpen.value).toBe(true);
    expect(tables.error.value).toContain("Header row count");
    expect(sheet.cells.get("0:0")?.style).toBeUndefined();
    expect(sheet.tables).toEqual([]);
    expect(workspace.session.history.undoStack).toHaveLength(0);
  });

  test("resolves a cell to its data region, creates a table and restores it with history", () => {
    const { workspace, tables, sheet } = fixture();
    tables.applyStyle(createBuiltinTableStyles("#9bbb59")[1]!);
    expect(tables.createInitial.value?.range).toBe("=Sheet1!$A$1:$B$3");
    tables.confirmCreate({ ...tables.createInitial.value!, range: "A1:B3", hasHeaders: true });
    expect(sheet.tables?.[0]).toMatchObject({ name: "Table1", style: { accentColor: "#9bbb59" } });
    expect(tables.modalOpen.value).toBe(false);
    expect(workspace.session.history.undoStack).toHaveLength(1);
    workspace.undo();
    expect(sheet.tables).toEqual([]);
    workspace.redo();
    expect(tables.activeTable.value?.name).toBe("Table1");
  });

  test("saves a reusable default style and applies edits to tables through one command", () => {
    const { workspace, tables, sheet } = fixture();
    const style: TableStyleDefinition = {
      id: "report",
      name: "Report",
      category: "custom",
      elements: { headerRow: { style: { fillColor: "#4bacc6" } } },
    };
    tables.openStyle();
    tables.confirmStyle({ style, setAsDefault: true });
    tables.requestCreate();
    tables.confirmCreate({ ...tables.createInitial.value!, range: "A1:B3", hasHeaders: true });
    expect(sheet.tables?.[0]?.style.id).toBe("report");
    tables.openStyle(style);
    const revised = { ...style, elements: { headerRow: { style: { fillColor: "#8064a2" } } } };
    tables.confirmStyle({ style: revised, setAsDefault: true });
    expect(sheet.tables?.[0]?.style).toEqual(revised);
    workspace.undo();
    expect(sheet.tables?.[0]?.style).toEqual(style);
    const restored = deserializeWorkbook(serializeWorkbook(workspace.session.workbook));
    expect(restored.defaultTableStyleId).toBe("report");
    expect(restored.tableStyles).toEqual([style]);
    expect([...restored.sheets.values()][0]?.tables?.[0]?.style.id).toBe("report");
  });

  test("saves and edits pivot-only elements with independent history and default selection", () => {
    const { workspace, tables, sheet } = fixture();
    const tableStyle: TableStyleDefinition = {
      id: "report",
      name: "Report",
      category: "custom",
      elements: { headerRow: { style: { fillColor: "#4bacc6" } } },
    };
    tables.openStyle();
    tables.confirmStyle({ style: tableStyle, setAsDefault: true });
    const cells = [...sheet.cells.entries()];
    const pivotStyle: PivotTableStyleDefinition = {
      id: "pivot-report",
      name: "Pivot report",
      category: "custom",
      elements: {
        totalRow: { style: { bold: true } },
        firstSubtotalRow: { style: { fillColor: "#9bbb59" } },
        pageFieldLabels: { style: { italic: true } },
      },
    };
    tables.openPivotStyle();
    expect(tables.modalOpen.value).toBe(true);
    tables.confirmPivotStyle({ style: pivotStyle, setAsDefault: true });
    expect(tables.modalOpen.value).toBe(false);
    expect(tables.customPivotStyles.value).toEqual([pivotStyle]);
    expect(tables.defaultPivotStyleId.value).toBe(pivotStyle.id);
    expect(tables.customStyles.value).toEqual([tableStyle]);
    expect(tables.defaultStyleId.value).toBe(tableStyle.id);
    expect(sheet.tables).toEqual([]);
    expect([...sheet.cells.entries()]).toEqual(cells);

    const restored = deserializeWorkbook(serializeWorkbook(workspace.session.workbook));
    expect(restored.pivotTableStyles).toEqual([pivotStyle]);
    expect(restored.defaultPivotTableStyleId).toBe(pivotStyle.id);
    tables.openPivotStyle(pivotStyle);
    const revised = {
      ...pivotStyle,
      elements: { ...pivotStyle.elements, totalRow: { style: { fillColor: "#8064a2" } } },
    };
    tables.confirmPivotStyle({ style: revised, setAsDefault: false });
    expect(tables.defaultPivotStyleId.value).toBeUndefined();
    expect(tables.customPivotStyles.value).toEqual([revised]);
    workspace.undo();
    expect(tables.customPivotStyles.value).toEqual([pivotStyle]);
    expect(tables.defaultPivotStyleId.value).toBe(pivotStyle.id);
    workspace.redo();
    expect(tables.customPivotStyles.value).toEqual([revised]);
    expect(tables.customStyles.value).toEqual([tableStyle]);
  });

  test("deletes custom table and pivot styles, clears their defaults, and restores both with undo", () => {
    const { workspace, tables, sheet } = fixture();
    const tableStyle: TableStyleDefinition = {
      id: "report",
      name: "Report",
      category: "custom",
      elements: { headerRow: { style: { fillColor: "#4bacc6" } } },
    };
    const pivotStyle: PivotTableStyleDefinition = {
      id: "pivot-report",
      name: "Pivot report",
      category: "custom",
      elements: { totalRow: { style: { bold: true } } },
    };
    tables.confirmStyle({ style: tableStyle, setAsDefault: true });
    tables.requestCreate();
    tables.confirmCreate({ ...tables.createInitial.value!, range: "A1:B3", hasHeaders: true });
    tables.confirmPivotStyle({ style: pivotStyle, setAsDefault: true });

    tables.deleteStyle(tableStyle);
    expect(tables.customStyles.value).toEqual([]);
    expect(tables.defaultStyleId.value).toBeUndefined();
    expect(sheet.tables?.[0]?.style).toEqual(tableStyle);
    workspace.undo();
    expect(tables.customStyles.value).toEqual([tableStyle]);
    expect(tables.defaultStyleId.value).toBe(tableStyle.id);

    tables.deletePivotStyle(pivotStyle);
    expect(tables.customPivotStyles.value).toEqual([]);
    expect(tables.defaultPivotStyleId.value).toBeUndefined();
    workspace.undo();
    expect(tables.customPivotStyles.value).toEqual([pivotStyle]);
    expect(tables.defaultPivotStyleId.value).toBe(pivotStyle.id);
  });

  test("discards pivot style drafts on cancel and when another document opens", async () => {
    const { workspace, tables } = fixture();
    tables.openPivotStyle();
    tables.close();
    expect(tables.pivotStyleDraft.value).toBeUndefined();
    expect(workspace.session.history.undoStack).toHaveLength(0);
    tables.openPivotStyle();
    workspace.replaceWorkbook(createWorkbook({ idFactory: createSequentialIdFactory() }));
    await nextTick();
    expect(tables.pivotStyleDraft.value).toBeUndefined();
    expect(tables.modalOpen.value).toBe(false);
  });

  test("renames and changes table options together, then converts to a range", () => {
    const { workspace, tables, sheet } = fixture();
    tables.requestCreate();
    tables.confirmCreate({ ...tables.createInitial.value!, range: "A1:B3", hasHeaders: true });
    tables.openSettings();
    tables.confirmSettings({
      ...tables.settingsTarget.value!.initial,
      name: "Sales",
      range: "A1:B3",
      bandedColumns: true,
      firstColumn: true,
    });
    expect(workspace.session.history.undoStack).toHaveLength(2);
    expect(sheet.tables?.[0]).toMatchObject({
      name: "Sales",
      bandedColumns: true,
      firstColumn: true,
    });
    workspace.undo();
    expect(sheet.tables?.[0]).toMatchObject({
      name: "Table1",
      bandedColumns: false,
      firstColumn: false,
    });
    tables.openSettings();
    tables.convertToRange();
    expect(sheet.tables).toEqual([]);
    expect(getCellContent(sheet, { row: 1, column: 1 })).toMatchObject({ value: 10 });
    expect(sheet.cells.get("0:0")?.style?.fillColor).toBeDefined();
  });

  test("discards dialog targets when a different workbook loads", async () => {
    const { workspace, tables } = fixture();
    tables.requestCreate();
    expect(tables.modalOpen.value).toBe(true);
    workspace.replaceWorkbook(createWorkbook({ idFactory: createSequentialIdFactory() }));
    await nextTick();
    expect(tables.modalOpen.value).toBe(false);
  });

  test("toggles headers from the settings draft while preserving data and totals", () => {
    const { workspace, tables, sheet } = fixture();
    tables.requestCreate();
    tables.confirmCreate({ ...tables.createInitial.value!, range: "A1:B3", hasHeaders: true });
    tables.openSettings();
    tables.confirmSettings({ ...tables.settingsTarget.value!.initial, totalRow: true });
    expect(sheet.tables?.[0]?.range.end.row).toBe(3);

    tables.openSettings();
    tables.confirmSettings({ ...tables.settingsTarget.value!.initial, headerRow: false });
    expect(tables.modalOpen.value).toBe(false);
    expect(sheet.tables?.[0]).toMatchObject({
      headerRow: false,
      totalRow: true,
      range: { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
    });
    expect(getCellContent(sheet, { row: 0, column: 0 })).toMatchObject({ value: "East" });
    expect(getCellContent(sheet, { row: 1, column: 1 })).toMatchObject({ value: 20 });

    tables.openSettings();
    tables.confirmSettings({ ...tables.settingsTarget.value!.initial, headerRow: true });
    expect(tables.modalOpen.value).toBe(false);
    expect(sheet.tables?.[0]).toMatchObject({ headerRow: true, totalRow: true });
    expect(sheet.tables?.[0]?.range.end.row).toBe(3);
    expect(getCellContent(sheet, { row: 0, column: 0 })).toMatchObject({ value: "Region" });
    expect(getCellContent(sheet, { row: 1, column: 1 })).toMatchObject({ value: 10 });
    workspace.undo();
    expect(sheet.tables?.[0]?.headerRow).toBe(false);
    expect(getCellContent(sheet, { row: 0, column: 0 })).toMatchObject({ value: "East" });
  });

  test("applies contextual name and total options with reversible formulas", () => {
    const { workspace, tables, sheet } = fixture();
    tables.requestCreate();
    tables.confirmCreate(tables.createInitial.value!);
    setCellContent(
      sheet,
      { row: 0, column: 4 },
      { kind: "formula", formula: { source: "=SUM(Table1[Amount])" } },
    );
    tables.renameTable("Sales");
    expect(tables.activeTable.value?.name).toBe("Sales");
    expect(getCellContent(sheet, { row: 0, column: 4 })).toMatchObject({
      formula: { source: "=SUM(Sales[Amount])" },
    });
    tables.updateTable({ totalRow: true });
    expect(sheet.tables?.[0]?.range.end.row).toBe(3);
    expect(getCellContent(sheet, { row: 3, column: 1 })).toMatchObject({
      formula: { source: "=SUBTOTAL(109,B2:B3)" },
    });
    workspace.undo();
    expect(sheet.tables?.[0]?.totalRow).toBe(false);
    workspace.undo();
    expect(tables.activeTable.value?.name).toBe("Table1");
    expect(getCellContent(sheet, { row: 0, column: 4 })).toMatchObject({
      formula: { source: "=SUM(Table1[Amount])" },
    });
  });

  test("resizes the captured table and converts from the contextual toolbar", () => {
    const { workspace, tables, sheet } = fixture();
    tables.requestCreate();
    tables.confirmCreate(tables.createInitial.value!);
    tables.updateTable({ totalRow: true });
    tables.openResize();
    expect(tables.resizeTarget.value?.range).toBe("=Sheet1!$A$1:$B$4");
    tables.confirmResize("A1:B3");
    expect(tables.modalOpen.value).toBe(false);
    expect(sheet.tables?.[0]?.range.end.row).toBe(2);
    expect(getCellContent(sheet, { row: 2, column: 1 })?.kind).toBe("formula");
    expect(getCellContent(sheet, { row: 3, column: 1 })).toBeNull();
    workspace.undo();
    expect(sheet.tables?.[0]?.range.end.row).toBe(3);
    tables.convertToRange();
    expect(sheet.tables).toEqual([]);
    workspace.undo();
    expect(tables.activeTable.value?.name).toBe("Table1");
  });
});
