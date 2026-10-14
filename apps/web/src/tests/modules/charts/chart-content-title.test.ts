import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import { createWorkbook, getActiveSheet, createSheetEvaluator } from "@sheetcraft/core/workbook";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import ChartContent from "../../../modules/charts/components/ChartContent.vue";
import { createAppI18n } from "../../../shared/i18n";

describe("word cloud title placement", () => {
  test("none keeps the title text, above reserves space and overlay releases it", async () => {
    const sheet = getActiveSheet(createWorkbook({ id: "words", sheetId: "sheet" }));
    const drawing: SheetChartDrawing = {
      id: "chart",
      kind: "chart",
      name: "Words",
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
        type: "wordCloud",
        range: null,
        title: "Retained title",
        headerRow: true,
        headerColumn: true,
        seriesBy: "columns",
        legend: true,
        labels: true,
        stacked: true,
        showHidden: false,
        dataCache: {
          categories: ["Apple"],
          series: [{ name: "Count", values: [60] }],
          records: [],
        },
      },
    };
    const wrapper = mount(ChartContent, {
      props: { drawing, sheet, evaluator: createSheetEvaluator(sheet), revision: 0 },
      global: { plugins: [createAppI18n("en-US")] },
    });
    try {
      const texts = () => wrapper.findAll("svg > text");
      const oldY = texts()[1]!.attributes("y");
      expect(texts()[0]!.text()).toBe("Retained title");
      await wrapper.setProps({
        drawing: { ...drawing, chart: { ...drawing.chart, elements: { titlePosition: "above" } } },
      });
      expect(texts()[1]!.attributes("y")).toBe(oldY);
      await wrapper.setProps({
        drawing: {
          ...drawing,
          chart: { ...drawing.chart, elements: { titlePosition: "overlay" } },
        },
      });
      const overlayY = Number(texts()[1]!.attributes("y"));
      expect(overlayY).toBeLessThan(Number(oldY));
      await wrapper.setProps({
        drawing: { ...drawing, chart: { ...drawing.chart, elements: { titlePosition: "none" } } },
      });
      expect(texts()).toHaveLength(1);
      expect(Number(texts()[0]!.attributes("y"))).toBe(overlayY);
      expect(wrapper.find("svg").attributes("aria-label")).toBe("Retained title");
      expect(drawing.chart.title).toBe("Retained title");
    } finally {
      wrapper.unmount();
    }
  });
});
