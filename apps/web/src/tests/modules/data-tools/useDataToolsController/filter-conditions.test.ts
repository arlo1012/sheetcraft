import { afterEach, describe, expect, test } from "vitest";
import { defineComponent, reactive } from "vue";
import { mount } from "@vue/test-utils";
import { createSheetFilterHiddenRowIntervals } from "@idea10/core/commands";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@idea10/core/history";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { deserializeWorkbook, serializeWorkbook } from "@idea10/core/serialization";
import {
  createSheetEvaluator,
  getActiveSheet,
  setCellContent,
  setCellStyle,
} from "@idea10/core/workbook";
import { createAppI18n } from "../../../../shared/i18n";
import { useDataToolsController } from "../../../../modules/data-tools/useDataToolsController";

const wrappers: Array<{ unmount: () => void }> = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  localStorage.clear();
});

function fixture() {
  const session = reactive(createWorkbookSession({ idFactory: createSequentialIdFactory() }));
  const sheet = getActiveSheet(session.workbook);
  const range = { start: { row: 0, column: 1 }, end: { row: 4, column: 2 } };
  ["Score", 10, 20, 20, 40].forEach((value, row) =>
    setCellContent(sheet, { row, column: 1 }, { kind: "literal", value }),
  );
  ["Team", "East", "East", "West", "West"].forEach((value, row) =>
    setCellContent(sheet, { row, column: 2 }, { kind: "literal", value }),
  );
  sheet.filter = { range, columns: [] };
  let controller!: ReturnType<typeof useDataToolsController>;
  wrappers.push(
    mount(
      defineComponent({
        setup() {
          controller = useDataToolsController({
            getWorkbook: () => session.workbook,
            getSheetEvaluator: () => createSheetEvaluator(getActiveSheet(session.workbook)),
            getSelection: () => ({ address: { row: 1, column: 1 }, range }),
            getGeneration: () => 0,
            isBusy: () => false,
            flush: () => true,
            execute: (command) => executeWorkbookCommand(session, command),
            focusSheet: () => undefined,
          });
          return () => null;
        },
      }),
      { global: { plugins: [createAppI18n("en-US")] } },
    ),
  );
  const hidden = () => createSheetFilterHiddenRowIntervals(getActiveSheet(session.workbook));
  return { session, sheet, controller, hidden };
}

describe("filter condition workflows", () => {
  test("discovers displayed body colors and confirms them through history and persistence", () => {
    const f = fixture();
    setCellStyle(f.sheet, { row: 0, column: 1 }, { fillColor: "#0000ff" });
    setCellStyle(f.sheet, { row: 2, column: 1 }, { fillColor: "#ff0000" });
    f.sheet.conditionalFormats = [
      {
        id: "high",
        anchor: { row: 1, column: 1 },
        ranges: [{ start: { row: 1, column: 1 }, end: { row: 4, column: 1 } }],
        condition: { kind: "cellValue", operator: "greaterThan", value: 30 },
        style: { fillColor: "#ff0000", textColor: "#800080" },
      },
    ];
    f.controller.openColumnFilter(1);
    expect(f.controller.filterState.value?.colors.cellColors).toEqual([null, "#ff0000"]);
    expect(f.controller.filterState.value?.colors.fontColors).toContain("#800080");
    f.controller.applyColumnFilter({
      includedKeys: [],
      criteria: { kind: "color", target: "fill", color: "#ff0000" },
    });
    expect(f.hidden()).toEqual([
      { start: 1, end: 1 },
      { start: 3, end: 3 },
    ]);
    expect(f.controller.filterState.value).toBeUndefined();
    expect(
      deserializeWorkbook(serializeWorkbook(f.session.workbook)).sheets.get(f.sheet.id)?.filter
        ?.columns[0]?.condition,
    ).toEqual({ kind: "color", target: "fill", color: "#ff0000" });
    undoWorkbookCommand(f.session);
    expect(f.hidden()).toEqual([]);
    redoWorkbookCommand(f.session);
    expect(f.hidden()).toEqual([
      { start: 1, end: 1 },
      { start: 3, end: 3 },
    ]);
  });

  test("combines conditions, ranks against the full column and clears only the current column", () => {
    const f = fixture();
    f.controller.openColumnFilter(1);
    f.controller.applyColumnFilter({
      includedKeys: [],
      criteria: {
        kind: "compound",
        operator: "and",
        conditions: [
          { kind: "number", operator: "greaterThan", value: 10 },
          { kind: "number", operator: "lessThan", value: 40 },
        ],
      },
    });
    expect(f.hidden()).toEqual([
      { start: 1, end: 1 },
      { start: 4, end: 4 },
    ]);
    f.controller.openColumnFilter(2);
    f.controller.applyColumnFilter({ includedKeys: [{ kind: "string", value: "East" }] });
    f.controller.openColumnFilter(1);
    f.controller.applyColumnFilter({
      includedKeys: [],
      criteria: { kind: "rank", bottom: false, percent: false, count: 1 },
    });
    expect(f.hidden()).toEqual([{ start: 1, end: 4 }]);
    f.controller.openColumnFilter(1);
    f.controller.clearColumnFilter();
    expect(getActiveSheet(f.session.workbook).filter?.columns).toEqual([
      { column: 2, allowedValues: [{ kind: "string", value: "East" }] },
    ]);
    expect(f.hidden()).toEqual([{ start: 3, end: 4 }]);
    f.controller.openColumnFilter(1);
    f.controller.applyColumnFilter({
      includedKeys: [],
      criteria: { kind: "average", above: false },
    });
    expect(f.hidden()).toEqual([{ start: 3, end: 4 }]);
  });
});
