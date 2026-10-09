import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Button } from "tdesign-vue-next/es/button";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import {
  createWorkbook,
  getActiveSheet,
  createSheetEvaluator,
  setCellContent,
} from "@idea10/core/workbook";
import { createWorkbookSession, executeWorkbookCommand } from "@idea10/core/history";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import type { WorkbookCommand } from "@idea10/core/commands";
import type { SheetChartDrawing } from "@idea10/core/sheet-drawings";
import ChartEditorDialog from "../../../modules/charts/components/ChartEditorDialog.vue";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import { useChartActions } from "../../../modules/charts/useChartActions";
import { createAppI18n } from "../../../shared/i18n";
const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});
function fixture() {
  const workbook = createWorkbook({ id: "cached-chart", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  const session = createWorkbookSession({
    workbook,
    idFactory: createSequentialIdFactory(),
  });
  const drawing: SheetChartDrawing = {
    id: "chart",
    kind: "chart",
    name: "Sales",
    anchor: { row: 0, column: 0 },
    offsetX: 0,
    offsetY: 0,
    width: 480,
    height: 300,
    text: "",
    shape: "rectangle",
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 1,
    color: "#000000",
    fontSize: 14,
    bold: false,
    italic: false,
    rotation: 0,
    chart: {
      type: "column",
      range: null,
      title: "Frozen sales",
      headerRow: true,
      headerColumn: true,
      seriesBy: "columns",
      legend: true,
      labels: false,
      stacked: false,
      showHidden: false,
      dataCache: {
        categories: ["East"],
        series: [{ name: "Sales", values: [42] }],
        records: [["East", 42]],
      },
    },
  };
  sheet.drawings = [drawing];
  const execute = vi.fn((command: WorkbookCommand) => executeWorkbookCommand(session, command));
  const actions = useChartActions({
    getWorkbook: () => workbook,
    getSheet: () => sheet,
    getRange: () => ({
      start: { row: 0, column: 0 },
      end: { row: 1, column: 1 },
    }),
    getEvaluator: () => createSheetEvaluator(sheet),
    isBusy: () => false,
    flush: () => true,
    execute,
    name: () => "Sales",
  });
  return { workbook, sheet, session, drawing, execute, actions };
}
describe("detached pivot charts", () => {
  test("cached source controls stay locked until explicit linking, which only changes the draft", async () => {
    const f = fixture();
    const wrapper = mount(ChartEditorDialog, {
      attachTo: document.body,
      props: {
        drawing: f.drawing,
        workbook: f.workbook,
        sheet: f.sheet,
        evaluator: createSheetEvaluator(f.sheet),
        revision: 0,
        disabled: false,
        error: false,
        suspended: false,
        selectReference: vi.fn(async () => undefined),
      },
      global: {
        plugins: [createAppI18n("en-US")],
        stubs: { ChartContent: true },
      },
    });
    mounted.push(wrapper);
    expect(wrapper.findComponent(RangeReferenceInput).props("disabled")).toBe(true);
    const locked = () =>
      wrapper
        .findAllComponents(Checkbox)
        .filter((_, index) => [0, 1, 2, 6].includes(index))
        .map((control) => !!control.props("disabled"));
    expect(locked()).toEqual([true, true, true, true]);
    const link = wrapper
      .findAllComponents(Button)
      .find((button) => button.text() === "Use worksheet data")!;
    expect(link.exists()).toBe(true);
    link.vm.$emit("click");
    await flushPromises();
    expect(wrapper.findComponent(RangeReferenceInput).props("disabled")).toBe(false);
    expect(locked()).toEqual([false, false, false, false]);
    expect(f.drawing.chart.dataCache).toBeDefined();
    wrapper.findComponent(Dialog).vm.$emit("confirm");
    const result = wrapper.emitted("confirm")![0]![0] as SheetChartDrawing;
    expect(result.chart.dataCache).toBeUndefined();
    expect(f.drawing.chart.dataCache).toBeDefined();
  });
  test("editing cached chart styling accepts an empty worksheet source and retains frozen data", () => {
    const f = fixture();
    f.actions.edit(f.drawing);
    f.actions.confirm(
      {
        ...f.drawing,
        chart: { ...f.drawing.chart, title: "Updated", labels: true },
      },
      "",
    );
    expect(f.actions.editing.value).toBeUndefined();
    expect(f.actions.error.value).toBe(false);
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.session.history.undoStack).toHaveLength(1);
    const result = f.sheet.drawings![0] as SheetChartDrawing;
    expect(result.chart).toMatchObject({
      title: "Updated",
      labels: true,
      range: null,
      dataCache: f.drawing.chart.dataCache,
    });
  });
  test("explicit linking validates a worksheet range before replacing cached data", () => {
    const f = fixture();
    f.actions.edit(f.drawing);
    const next = { ...f.drawing, chart: { ...f.drawing.chart } };
    delete next.chart.dataCache;
    f.actions.confirm(next, "");
    expect(f.actions.error.value).toBe(true);
    expect(f.actions.editing.value).toBeDefined();
    expect(f.execute).not.toHaveBeenCalled();
    [
      ["Region", "Sales"],
      ["West", 13],
    ].forEach((row, r) =>
      row.forEach((value, column) =>
        setCellContent(f.sheet, { row: r, column }, { kind: "literal", value }),
      ),
    );
    f.actions.confirm(next, "A1:B2");
    expect(f.actions.editing.value).toBeUndefined();
    const result = f.sheet.drawings![0] as SheetChartDrawing;
    expect(result.chart.dataCache).toBeUndefined();
    expect(result.chart.range).toEqual({
      start: { row: 0, column: 0 },
      end: { row: 1, column: 1 },
    });
  });
  test("a rejected cached chart update retains the editor and reports failure without history", () => {
    const f = fixture();
    f.actions.edit(f.drawing);
    f.execute.mockReturnValueOnce(false);
    f.actions.confirm({ ...f.drawing, chart: { ...f.drawing.chart, title: "Rejected" } }, "");
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.actions.editing.value).toBe(f.drawing);
    expect(f.actions.error.value).toBe(true);
    expect(f.sheet.drawings![0]).toBe(f.drawing);
    expect(f.drawing.chart.title).toBe("Frozen sales");
    expect(f.session.history.undoStack).toHaveLength(0);
  });
});
