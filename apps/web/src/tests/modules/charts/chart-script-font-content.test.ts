import { mount } from "@vue/test-utils";
import { expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet, createSheetEvaluator } from "@sheetcraft/core/workbook";
import { DEFAULT_WORKBOOK_THEME } from "@sheetcraft/core/workbook-theme";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import ChartContent from "../../../modules/charts/components/ChartContent.vue";
import { createAppI18n } from "../../../shared/i18n";
const fonts = vi.hoisted(() => ({ families: vi.fn((family: string) => [family]) }));
vi.mock("../../../shared/cell-text/font-resources", () => ({
  getCellFontResourceFamilies: fonts.families,
  getCellFontResourceStatus: () => ({ state: "ready" }),
  ensureCellFontResource: async () => {},
  retryCellFontResource: async () => {},
}));

test("live SVG title reacts to current theme and discloses complex-script fallback without mutating bindings", async () => {
  const sheet = getActiveSheet(createWorkbook({ id: "script-fonts", sheetId: "sheet" }));
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
      title: "A中文",
      headerRow: true,
      headerColumn: true,
      seriesBy: "columns",
      legend: true,
      labels: true,
      stacked: true,
      showHidden: false,
      dataCache: { categories: ["Apple"], series: [{ name: "Count", values: [60] }], records: [] },
      format: {
        title: {
          scriptFonts: {
            latin: { kind: "theme", role: "minor", slot: "latin" },
            eastAsia: { kind: "theme", role: "minor", slot: "eastAsia" },
            complexScript: { kind: "automatic" },
          },
        },
      },
    },
  };
  const theme = { ...DEFAULT_WORKBOOK_THEME, fonts: { ...DEFAULT_WORKBOOK_THEME.fonts } };
  const wrapper = mount(ChartContent, {
    props: { drawing, theme, sheet, evaluator: createSheetEvaluator(sheet), revision: 0 },
    global: { plugins: [createAppI18n("en-US")] },
  });
  try {
    const runs = () => wrapper.findAll("svg > text:first-of-type > tspan");
    expect(runs().map((run) => [run.text(), run.attributes("font-family")])).toEqual([
      ["A", "Inter"],
      ["中文", "宋体"],
    ]);
    expect(fonts.families).toHaveBeenCalledWith("Inter", expect.anything(), expect.anything());
    expect(fonts.families).toHaveBeenCalledWith("宋体", expect.anything(), expect.anything());
    await wrapper.setProps({
      theme: { ...theme, bodyFont: "New Latin", fonts: { ...theme.fonts, bodyEastAsia: "New EA" } },
    });
    expect(runs().map((run) => run.attributes("font-family"))).toEqual(["New Latin", "New EA"]);
    await wrapper.setProps({
      drawing: { ...drawing, chart: { ...drawing.chart, title: "A العربية 中文" } },
    });
    expect(runs()).toHaveLength(1);
    expect(runs()[0]!.text()).toBe("A العربية 中文");
    expect(wrapper.get('[role="status"]').text()).toContain("preview");
    await wrapper.setProps({
      drawing: { ...drawing, chart: { ...drawing.chart, title: "A\n中文" } },
    });
    expect(
      runs()
        .map((run) => run.text())
        .join(" "),
    ).toBe("A 中文");
    expect(wrapper.get('[role="status"]').text()).toContain("single-line");
    expect(drawing.chart.format?.title?.scriptFonts?.latin).toEqual({
      kind: "theme",
      role: "minor",
      slot: "latin",
    });
  } finally {
    wrapper.unmount();
  }
});
