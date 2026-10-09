import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { createWorkbook, getActiveSheet, createSheetEvaluator } from "@sheetcraft/core/workbook";
import type { ChartData, SheetChart } from "@sheetcraft/core/sheet-charts";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import ChartEditorDialog from "../../../modules/charts/components/ChartEditorDialog.vue";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import { createChartOption } from "../../../modules/charts/chart-option";
import { createAppI18n } from "../../../shared/i18n";
const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});
const chart: SheetChart = {
  type: "column",
  range: { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
  title: "Sales",
  headerRow: true,
  headerColumn: true,
  seriesBy: "columns",
  legend: true,
  labels: true,
  stacked: false,
  showHidden: false,
};
function setup(linked: boolean) {
  const workbook = createWorkbook({ id: "chart-book", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
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
    chart: { ...chart, ...(linked ? { pivotTableId: "pivot" } : {}) },
  };
  const wrapper = mount(ChartEditorDialog, {
    attachTo: document.body,
    props: {
      drawing,
      workbook,
      sheet,
      evaluator: createSheetEvaluator(sheet),
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
  return { wrapper, drawing };
}
type FormattedOption = {
  series: Array<{
    data: number[];
    label: { formatter: (params: { value: number }) => string };
    tooltip: { valueFormatter: (value: number) => string };
  }>;
  yAxis: { axisLabel: { formatter: (value: number) => string } };
  xAxis: { axisLabel: { formatter: (value: number) => string } };
};
describe("pivot charts", () => {
  test.each([true, false])(
    "linked=%s keeps source orientation fixed while show-hidden remains editable",
    async (linked) => {
      const f = setup(linked);
      expect(f.wrapper.findComponent(RangeReferenceInput).props("disabled")).toBe(linked);
      const checkboxes = f.wrapper.findAllComponents(Checkbox);
      expect(checkboxes.slice(0, 3).map((control) => !!control.props("disabled"))).toEqual([
        linked,
        linked,
        linked,
      ]);
      const showHidden = checkboxes[6]!;
      expect(!!showHidden.props("disabled")).toBe(false);
      showHidden.vm.$emit("update:modelValue", true);
      await flushPromises();
      f.wrapper.findComponent(Dialog).vm.$emit("confirm");
      const result = f.wrapper.emitted("confirm")![0]![0] as SheetChartDrawing;
      expect(result.chart.showHidden).toBe(true);
      expect(result.chart.pivotTableId).toBe(linked ? "pivot" : undefined);
      expect(f.drawing.chart.showHidden).toBe(false);
    },
  );
  test.each([
    {
      format: { kind: "percent" as const, fractionDigits: 1 },
      raw: 0.125,
      text: "12.5%",
    },
    {
      format: { kind: "currency" as const, currency: "USD", fractionDigits: 2 },
      raw: 1234.5,
      text: "$1,234.50",
    },
  ])(
    "formats $format.kind labels, tooltips and value axes without changing raw data",
    ({ format, raw, text }) => {
      const data: ChartData = {
        categories: ["East"],
        records: [],
        series: [{ name: "Sales", values: [raw], numberFormat: format }],
      };
      for (const type of ["column", "bar"] as const) {
        const option = createChartOption({ ...chart, type }, data) as unknown as FormattedOption;
        const series = option.series[0]!;
        expect(series.data).toEqual([raw]);
        expect(series.label.formatter({ value: raw })).toBe(text);
        expect(series.tooltip.valueFormatter(raw)).toBe(text);
        expect((type === "bar" ? option.xAxis : option.yAxis).axisLabel.formatter(raw)).toBe(text);
      }
    },
  );
  test("mixed series retain individual formats and leave the shared axis unformatted", () => {
    const data: ChartData = {
      categories: ["East"],
      records: [],
      series: [
        {
          name: "Rate",
          values: [0.125],
          numberFormat: { kind: "percent", fractionDigits: 1 },
        },
        {
          name: "Sales",
          values: [1234.5],
          numberFormat: {
            kind: "currency",
            currency: "USD",
            fractionDigits: 2,
          },
        },
      ],
    };
    const option = createChartOption(chart, data) as unknown as FormattedOption;
    expect(option.series[0]!.tooltip.valueFormatter(0.125)).toBe("12.5%");
    expect(option.series[1]!.tooltip.valueFormatter(1234.5)).toBe("$1,234.50");
    expect(option.yAxis.axisLabel?.formatter).toBeUndefined();
  });
});
