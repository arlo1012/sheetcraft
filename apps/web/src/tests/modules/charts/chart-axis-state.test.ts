import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import type { ChartValueAxisFormat } from "@sheetcraft/core/chart-format";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import { getSheetChartData, type ChartData, type SheetChart } from "@sheetcraft/core/sheet-charts";
import { createWorkbook, createWorkbookEvaluator, getActiveSheet } from "@sheetcraft/core/workbook";
import ChartFormatPane from "../../../modules/charts/components/ChartFormatPane.vue";
import type {
  ChartFormatIntent,
  ChartFormatTarget,
} from "../../../modules/charts/chart-format-pane";
import { createAppI18n } from "../../../shared/i18n";
import { createChartOption } from "../../../modules/charts/chart-option";
import {
  chartMinorGridlinesForAxis,
  effectiveChartMinorGridlines,
  resolveChartAxisIntervals,
} from "../../../modules/charts/chart-axis-state";

vi.mock("../../../shared/cell-text/useFontCatalog", async () => {
  const { computed } = await import("vue");
  return {
    useFontCatalog: () => ({ fontOptions: computed(() => [{ value: "Arial", label: "Arial" }]) }),
  };
});
const wrappers: VueWrapper[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});
function drawing(changes: Partial<SheetChart> = {}, id = "chart-one"): SheetChartDrawing {
  return {
    id,
    kind: "chart",
    name: "Sales chart",
    anchor: { row: 0, column: 0 },
    offsetX: 0,
    offsetY: 0,
    width: 480,
    height: 320,
    text: "",
    shape: "rectangle",
    fill: "transparent",
    stroke: "transparent",
    strokeWidth: 0,
    color: "#000000",
    fontSize: 12,
    bold: false,
    italic: false,
    rotation: 0,
    chart: {
      type: "column",
      title: "Sales",
      range: null,
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
            colorIndex: 0,
            name: { kind: "literal", text: "Apples" },
            values: { kind: "literal", values: [10, 20] },
          },
          {
            id: "pears",
            colorIndex: 1,
            name: { kind: "literal", text: "Pears" },
            values: { kind: "literal", values: [30, 40] },
          },
        ],
      },
      ...changes,
    },
  };
}
const data: ChartData = {
  categories: ["East", "North"],
  records: [],
  series: [
    { id: "apples", name: "Apples", values: [10, 20] },
    { id: "pears", name: "Pears", values: [30, 40] },
  ],
};
function fixture(
  target: ChartFormatTarget = { kind: "valueAxis" },
  extra: Record<string, unknown> = {},
) {
  const apply = vi.fn((_intent: ChartFormatIntent) => true);
  const wrapper = mount(ChartFormatPane, {
    attachTo: document.body,
    props: { drawing: drawing(), data, target, disabled: false, apply, ...extra },
    global: {
      plugins: [createAppI18n("en-US")],
      stubs: {
        ColorPaletteSelect: {
          props: ["modelValue", "disabled", "label"],
          emits: ["select"],
          template: '<button type="button" :disabled="disabled" :aria-label="label" />',
        },
        FontFormatField: {
          props: ["modelValue", "disabled", "label"],
          emits: ["change"],
          template: '<input :value="modelValue" :disabled="disabled" :aria-label="label" />',
        },
        FontSettingsAction: true,
      },
    },
  });
  wrappers.push(wrapper);
  return { wrapper, apply };
}
function gridControl(wrapper: VueWrapper) {
  return wrapper
    .findAllComponents(Checkbox)
    .find((component) => component.attributes("data-chart-format-field") === "minorGridlines")!;
}
function renderedAxis(chart: SheetChart, values: ChartData = data, secondary = false) {
  const option = createChartOption(chart, values);
  const axes = chart.type === "bar" ? option.xAxis : option.yAxis;
  return (Array.isArray(axes) ? axes[secondary ? 1 : 0] : axes) as {
    minorSplitLine?: { show?: boolean };
    minorTick?: { show?: boolean; splitNumber?: number };
  };
}

describe("effective minor gridline state", () => {
  for (const divisions of [undefined, 1, 5]) {
    for (const explicit of [undefined, false, true]) {
      test(`pane/render parity for subdivisions ${divisions}, explicit ${explicit}`, () => {
        const settings: ChartValueAxisFormat = {
          min: 20,
          max: 180,
          majorUnit: 40,
          ...(divisions === undefined ? {} : { minorUnit: 40 / divisions }),
          ...(explicit === undefined ? {} : { minorGridlines: explicit }),
        };
        const item = drawing({ format: { valueAxis: settings } });
        const expected = explicit ?? (divisions !== undefined && divisions > 1);
        const { wrapper, apply } = fixture(undefined, { drawing: item });
        expect(gridControl(wrapper).props("checked")).toBe(expected);
        expect(gridControl(wrapper).props("indeterminate")).toBe(false);
        const axis = renderedAxis(item.chart);
        expect(axis.minorSplitLine?.show ?? false).toBe(expected);
        expect(axis.minorTick?.show ?? false).toBe(
          explicit === true || (divisions !== undefined && divisions > 1),
        );
        if (divisions !== undefined || explicit === true)
          expect(axis.minorTick?.splitNumber).toBe(divisions ?? 5);
        expect(effectiveChartMinorGridlines(settings, divisions)).toBe(expected);
        expect(apply).not.toHaveBeenCalled();
      });
    }
  }

  test("unchecking an implicit checked grid persists false without changing ticks; omission restores", async () => {
    const settings = { min: 20, max: 180, majorUnit: 40, minorUnit: 8 };
    const original = drawing({ format: { valueAxis: settings } });
    const before = structuredClone(original);
    const { wrapper, apply } = fixture(undefined, { drawing: original });
    gridControl(wrapper).vm.$emit("change", false);
    expect(apply).toHaveBeenCalledExactlyOnceWith({
      kind: "valueAxis",
      format: { ...settings, minorGridlines: false },
    });
    expect(original).toEqual(before);
    const disabledGrid = drawing({ format: { valueAxis: { ...settings, minorGridlines: false } } });
    await wrapper.setProps({ drawing: disabledGrid });
    expect(gridControl(wrapper).props("checked")).toBe(false);
    expect(renderedAxis(disabledGrid.chart)).toMatchObject({
      minorSplitLine: { show: false },
      minorTick: { show: true, splitNumber: 5 },
    });
    // The existing Core history owner restores omission; no display default is persisted.
    await wrapper.setProps({ drawing: original });
    expect(gridControl(wrapper).props("checked")).toBe(true);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  test("seriesFilter visibleData determines a minor-only auto major interval and updates live", async () => {
    const item = drawing({ format: { valueAxis: { minorUnit: 10 } } });
    item.chart.source!.series[1]!.values = { kind: "literal", values: [1000, 1000] };
    const workbook = createWorkbook({ id: "minor-grid", sheetId: "s", sheetName: "Sheet1" });
    const sheet = getActiveSheet(workbook);
    const evaluator = createWorkbookEvaluator(workbook, sheet.id);
    const full = getSheetChartData(sheet, item.chart, evaluator);
    const filtered = { ...item.chart, seriesFilter: { hiddenSeriesIds: ["pears"] } };
    const visible = getSheetChartData(sheet, filtered, evaluator);
    expect(visible.series.map((entry) => entry.id)).toEqual(["apples"]);
    expect(chartMinorGridlinesForAxis(item.chart, full, false)).toBe(true);
    expect(chartMinorGridlinesForAxis(filtered, visible, false)).toBe(false);
    const { wrapper, apply } = fixture(undefined, {
      drawing: { ...item, chart: filtered },
      data: full,
      visibleData: visible,
    });
    expect(gridControl(wrapper).props("checked")).toBe(false);
    expect(renderedAxis(filtered, visible).minorSplitLine?.show).toBe(false);
    await wrapper.setProps({ drawing: item, visibleData: full });
    expect(gridControl(wrapper).props("checked")).toBe(true);
    expect(renderedAxis(item.chart, full).minorSplitLine?.show).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  for (const type of ["column", "bar", "line", "combo"] as const) {
    test(`${type} primary and secondary use the same selected axis group`, async () => {
      const item = drawing({
        type,
        format: {
          valueAxis: { minorUnit: 10 },
          secondaryValueAxis: { minorUnit: 10 },
          series: [
            {
              id: "pears",
              axis: "secondary",
              ...(type === "combo" ? { drawType: "line" as const } : {}),
            },
          ],
        },
      });
      const values = {
        ...data,
        series: [data.series[0]!, { ...data.series[1]!, values: [1000, 1000] }],
      };
      const { wrapper } = fixture(undefined, { drawing: item, data: values });
      expect(gridControl(wrapper).props("checked")).toBe(false);
      expect(renderedAxis(item.chart, values).minorSplitLine?.show).toBe(false);
      await wrapper.setProps({ target: { kind: "secondaryValueAxis" } });
      expect(gridControl(wrapper).props("checked")).toBe(true);
      expect(renderedAxis(item.chart, values, true).minorSplitLine?.show).toBe(true);
    });
  }

  test("combo range-band identities use the saved secondary-axis route", () => {
    const item = drawing({
      type: "combo",
      range: { start: { row: 0, column: 0 }, end: { row: 2, column: 2 } },
      rectangleSeries: {
        rows: [],
        columns: [
          { index: 1, id: "apples" },
          { index: 2, id: "pears" },
        ],
      },
      format: {
        valueAxis: { minorUnit: 10 },
        secondaryValueAxis: { minorUnit: 10 },
        series: [{ id: "pears", axis: "secondary", drawType: "line" }],
      },
    });
    delete item.chart.source;
    const values: ChartData = {
      ...data,
      series: data.series.map((entry, index) => ({
        name: entry.name,
        values: index === 0 ? [10, 20] : [1000, 1000],
        rangeBand: { seriesBy: "columns", index: index + 1 },
      })),
    };
    const { wrapper } = fixture({ kind: "secondaryValueAxis" }, { drawing: item, data: values });
    expect(gridControl(wrapper).props("checked")).toBe(true);
    expect(renderedAxis(item.chart, values, true).minorSplitLine?.show).toBe(true);
    expect(renderedAxis(item.chart, values).minorSplitLine?.show).toBe(false);
  });

  test("scatter excludes its X series from value-axis domain", () => {
    const item = drawing({ type: "scatter", format: { valueAxis: { minorUnit: 10 } } });
    delete item.chart.source;
    const values = {
      ...data,
      series: [{ ...data.series[0]!, values: [1000, 1000] }, data.series[1]!],
    };
    const { wrapper } = fixture(undefined, { drawing: item, data: values });
    expect(gridControl(wrapper).props("checked")).toBe(false);
    expect(renderedAxis(item.chart, values).minorSplitLine?.show).toBe(false);
  });

  test("stacked percent units preserve ratio conversion and effective subdivision", () => {
    const item = drawing({
      stacked: true,
      presentation: { percentStacked: true },
      format: { valueAxis: { min: -100, max: 100, majorUnit: 25, minorUnit: 5 } },
    });
    const { wrapper } = fixture(undefined, { drawing: item });
    expect(gridControl(wrapper).props("checked")).toBe(true);
    expect(renderedAxis(item.chart)).toMatchObject({
      minorSplitLine: { show: true },
      minorTick: { show: true, splitNumber: 5 },
    });
  });

  test("unsafe axis values produce a disabled indeterminate control and an existing error", () => {
    const item = drawing({ format: { valueAxis: { min: 0, max: 2048, minorUnit: 1 } } });
    const { wrapper, apply } = fixture(undefined, { drawing: item });
    expect(gridControl(wrapper).props("disabled")).toBe(true);
    expect(gridControl(wrapper).props("indeterminate")).toBe(true);
    expect(wrapper.get('[role="alert"]').text()).toBeTruthy();
    expect(apply).not.toHaveBeenCalled();
    expect(() => resolveChartAxisIntervals(item.chart.format!.valueAxis, [40])).toThrow(/2048/);
  });
});
