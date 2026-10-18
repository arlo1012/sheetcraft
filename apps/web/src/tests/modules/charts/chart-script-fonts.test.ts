import { describe, expect, test } from "vitest";
import type { ChartTextFormat } from "@sheetcraft/core/chart-format";
import { DEFAULT_WORKBOOK_THEME } from "@sheetcraft/core/workbook-theme";
import type { SheetChart } from "@sheetcraft/core/sheet-charts";
import {
  createChartTextPlan,
  chartRichText,
  getChartFontFamilies,
  measureChartText,
  truncateChartText,
} from "../../../modules/charts/chart-script-fonts";
import { applyChartScriptFontFormat } from "../../../modules/charts/chart-format-render";
import { init } from "../../../modules/charts/chart-runtime";

const text: ChartTextFormat = {
  scriptFonts: {
    latin: { kind: "theme", role: "minor", slot: "latin" },
    eastAsia: { kind: "theme", role: "minor", slot: "eastAsia" },
    complexScript: { kind: "theme", role: "minor", slot: "complexScript" },
  },
};
const theme = {
  ...DEFAULT_WORKBOOK_THEME,
  bodyFont: "Inter",
  fonts: { ...DEFAULT_WORKBOOK_THEME.fonts, bodyEastAsia: "宋体", bodyComplexScript: "" },
};
const chart: SheetChart = {
  type: "column",
  title: "A中文",
  range: null,
  headerRow: true,
  headerColumn: true,
  seriesBy: "columns",
  legend: true,
  labels: false,
  stacked: false,
  showHidden: false,
  format: { title: text, legend: { text }, categoryAxis: { text }, valueAxis: { text } },
};

describe("shared chart script text plan", () => {
  test("paints Latin and East Asian text with independent faces, including combining graphemes", () => {
    const plan = createChartTextPlan("e\u0301中文 👩🏽‍💻! A", text, theme);
    expect(plan.runs.map((run) => [run.text, run.fontFamily])).toEqual([
      ["e\u0301", "Inter"],
      ["中文 👩🏽‍💻! ", "宋体"],
      ["A", "Inter"],
    ]);
    expect(plan.runs.map((run) => run.text).join("")).toBe(plan.text);
    expect(plan.limitations).toEqual([]);
    expect(
      measureChartText(plan, (value, family) => value.length * (family === "Inter" ? 2 : 3)),
    ).toBe(
      plan.runs.reduce(
        (sum, run) => sum + run.text.length * (run.fontFamily === "Inter" ? 2 : 3),
        0,
      ),
    );
  });
  test("Arabic and Indic shaping/bidi inputs remain one original paragraph with a disclosed boundary", () => {
    for (const value of ["ABC العربية 中文", "नमस्ते A", "a\u2067אב\u2069"]) {
      const plan = createChartTextPlan(value, text, theme);
      expect(plan.runs).toEqual([
        { text: value, script: "complexScript", fontFamily: "sans-serif" },
      ]);
      expect(plan.limitations).toContain("complex-shaping");
    }
  });
  test("absent caller theme is unresolved; current theme updates and print aliases remain transient", () => {
    expect(createChartTextPlan("A中", text).limitations).toContain("unresolved-font");
    expect(getChartFontFamilies(chart, theme)).toEqual(["Inter", "宋体"]);
    const next = { ...theme, bodyFont: "Arial" };
    expect(
      createChartTextPlan("A中", text, next, "sans-serif", (family) => `print-${family}`).runs.map(
        (run) => run.fontFamily,
      ),
    ).toEqual(["print-Arial", "print-宋体"]);
    expect(text.scriptFonts?.latin).toEqual({ kind: "theme", role: "minor", slot: "latin" });
  });
  test("truncation keeps combining sequences and emoji whole and measures the final paint", () => {
    const make = (value: string) => createChartTextPlan(value, text, theme);
    const plan = truncateChartText(
      "e\u0301中👩🏽‍💻ABC",
      4,
      make,
      (value) =>
        Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value))
          .length,
    );
    expect(plan.text).toBe("e\u0301中👩🏽‍💻…");
    expect(plan.runs.map((run) => run.text).join("")).toBe(plan.text);
  });
  test("preserves existing numeric formatters and applies real rich faces to axis names/title/legend", () => {
    const option = applyChartScriptFontFormat(
      {
        title: { text: chart.title },
        legend: { formatter: (name) => `组${name}` },
        xAxis: { type: "category", name: "Axis轴" },
        yAxis: { type: "value", axisLabel: { formatter: (value: number) => `${value}%` } },
      },
      chart,
      theme,
    );
    expect(JSON.stringify(option)).toContain('"fontFamily":"宋体"');
    expect(JSON.stringify(option)).toContain('"fontFamily":"Inter"');
    const axis = option.yAxis as {
      axisLabel: { formatter: (value: number, index: number) => string };
    };
    expect(axis.axisLabel.formatter(12, 0)).toBe("{sc_latin|12%}");
  });
  test("multiline mixed-script widths use the widest line and truncate each line independently", () => {
    const make = (value: string) => createChartTextPlan(value, text, theme);
    const measure = (value: string, family: string) =>
      Array.from(value).length * (family === "Inter" ? 5 : 10);
    expect(measureChartText(make("AB\n中"), measure)).toBe(10);
    expect(truncateChartText("ABCDEF\n中", 25, make, measure).text).toBe("ABCD…\n中");
    const engine = init(null, undefined, { renderer: "svg", ssr: true, width: 480, height: 300 });
    try {
      engine.setOption(
        applyChartScriptFontFormat(
          { title: { text: "Latin\n中文", textStyle: { width: 200, fontSize: 15 } }, series: [] },
          chart,
          theme,
        ),
      );
      const svg = new DOMParser().parseFromString(engine.renderToSVGString(), "image/svg+xml");
      const lines = Array.from(svg.querySelectorAll("text"));
      expect(lines.map((node) => node.textContent)).toEqual(["Latin", "中文"]);
      expect(lines[0]!.getAttribute("y")).not.toBe(lines[1]!.getAttribute("y"));
      expect(lines[0]!.getAttribute("style")).toContain("Inter");
      expect(lines[1]!.getAttribute("style")).toContain("宋体");
    } finally {
      engine.dispose();
    }
  });
  test("native SVG renders literal user rich syntax and independent script faces", () => {
    const engine = init(null, undefined, { renderer: "svg", ssr: true, width: 480, height: 300 });
    try {
      for (const value of ["A{danger|中}文", "中}", "{{", "👩🏽‍💻{foo|bar}"]) {
        const option = applyChartScriptFontFormat(
          { title: { text: value, textStyle: { fontSize: 15 } }, series: [] },
          chart,
          theme,
        );
        engine.setOption(option);
        const svg = engine.renderToSVGString();
        if (value.includes("A")) expect(svg).toContain("Inter");
        if (value.includes("中")) expect(svg).toContain("宋体");
        const document = new DOMParser().parseFromString(svg, "image/svg+xml");
        expect(
          Array.from(document.querySelectorAll("text"))
            .map((node) => node.textContent)
            .join(""),
        ).toBe(value);
        expect(chartRichText(createChartTextPlan(value, text, theme))).not.toContain("{danger|");
        if (value === "中}") {
          const brace = Array.from(document.querySelectorAll("text")).find(
            (node) => node.textContent === "}",
          );
          expect(brace?.getAttribute("style")).toContain("sans-serif");
          const plan = createChartTextPlan(value, text, theme);
          expect(plan.runs.at(-1)).toEqual({
            text: "}",
            script: "literal",
            fontFamily: "sans-serif",
          });
          expect(plan.limitations).toContain("rich-literal-font");
          const measured: string[] = [];
          measureChartText(plan, (value, family) => {
            measured.push(`${value}:${family}`);
            return 1;
          });
          expect(measured).toEqual(["中:宋体", "}:sans-serif"]);
        }
      }
    } finally {
      engine.dispose();
    }
  });
});
