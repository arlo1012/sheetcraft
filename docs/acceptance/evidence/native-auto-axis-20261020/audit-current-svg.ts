/**
 * Read-only product audit. Writes evidence only beside this script.
 * Run:
 * bun docs/acceptance/evidence/native-auto-axis-20261020/audit-current-svg.ts
 *
 * WPS observations below are manual observations from actual WPS inspection.
 * SSR SVG results are not a claim that browser font metrics match WPS.
 * splitNumber probes are diagnostic option copies, never product changes.
 */
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const evidence = dirname(fileURLToPath(import.meta.url));
const repo = resolve(evidence, "../../../..");

// Resolve the product's workspace imports to CURRENT TypeScript, not stale dist.
Bun.plugin({
  name: "read-only-sheetcraft-source-audit",
  setup(builder) {
    builder.onResolve({ filter: /^@sheetcraft\/core(?:\/.*)?$/ }, ({ path }) => ({
      path: resolve(
        repo,
        "packages/core/src",
        path === "@sheetcraft/core" ? "index.ts" : `${path.slice("@sheetcraft/core/".length)}.ts`,
      ),
    }));
  },
});
const { decodeXlsx } = await import(`${repo}/packages/xlsx-io/src/index.ts`);
const { getSheetChartData } = await import(`${repo}/packages/core/src/sheet-charts.ts`);
const { createWorkbookEvaluator } = await import(`${repo}/packages/core/src/workbook.ts`);
const { createChartOption } = await import(`${repo}/apps/web/src/modules/charts/chart-option.ts`);
const { init } = await import(`${repo}/apps/web/src/modules/charts/chart-runtime.ts`);
const require = createRequire(`${repo}/apps/web/package.json`);
const { unzipSync, strFromU8, strToU8, zipSync } = await import(require.resolve("fflate"));

type Observation = { min: number; max: number; step: number };
const observed: Record<string, Observation> = {
  base120: { min: 0, max: 140, step: 20 },
  max119: { min: 0, max: 140, step: 20 },
  max121: { min: 0, max: 140, step: 20 },
  scale01: { min: 0, max: 14, step: 2 },
  scale10: { min: 0, max: 1400, step: 200 },
  narrow: { min: 117, max: 120.5, step: 0.5 },
  small: { min: 0, max: 150, step: 50 },
  large: { min: 0, max: 140, step: 20 },
  short: { min: 0, max: 150, step: 50 },
  tall: { min: 0, max: 140, step: 20 },
  nomarkers: { min: 0, max: 140, step: 20 },
};
const matrix = JSON.parse(await readFile(resolve(evidence, "matrix-inputs.json"), "utf8"));
const names = new Set(matrix.map((item: { name: string }) => `auto-axis-${item.name}.xlsx`));
for (const file of await readdir(evidence)) {
  if (!file.startsWith(".") && file.endsWith("-wps-saved.xlsx")) names.add(file);
}
const outputDir = resolve(evidence, "current-svg");
await mkdir(outputDir, { recursive: true });
const expectedTicks = (observation: Observation) =>
  Array.from(
    { length: Math.round((observation.max - observation.min) / observation.step) + 1 },
    (_, index) => Number((observation.min + index * observation.step).toPrecision(14)),
  );
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const unescapeXml = (text: string) =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

function render(option: any, width: number, height: number) {
  const engine = init(null, undefined, { renderer: "svg", ssr: true, width, height });
  try {
    engine.setOption(option);
    const svg = engine.renderToSVGString();
    const textNodes = Array.from(svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g), (match) =>
      unescapeXml(match[1]!.replace(/<[^>]+>/g, "")),
    );
    const numericText = textNodes.filter((text) => /^-?\d[\d,]*(?:\.\d+)?$/.test(text));
    const axis = (engine as any).getModel().getComponent("yAxis", 0).axis;
    const tickValues = axis.scale.getTicks().map((tick: { value: number }) => tick.value);
    const viewLabels = axis.getViewLabels().map((label: any) => ({
      value: label.tick.value,
      formattedLabel: label.formattedLabel,
      presentInSvg: textNodes.includes(label.formattedLabel),
    }));
    return {
      svg,
      result: {
        tickValues,
        tickLabels: viewLabels,
        numericTextActuallyInSvg: numericText,
        extent: axis.scale.getExtent(),
        interval: axis.scale.getConfig().interval,
        gridRect: (engine as any).getModel().getComponent("grid", 0).coordinateSystem.getRect(),
        allTextActuallyInSvg: textNodes,
      },
    };
  } finally {
    engine.dispose();
  }
}

const results = [];
for (const filename of names) {
  const name = filename.replace(/^auto-axis-/, "").replace(/(?:-wps-saved)?\.xlsx$/, "");
  const observationSource = filename.endsWith("-wps-saved.xlsx")
    ? `Measured original ${name} chart in WPS; saved copy is compared to that observation, not an independently observed reopen.`
    : `Actual WPS observation documented in native-auto-axis-diagnosis-20261020.md`;
  const bytes = new Uint8Array(await readFile(resolve(evidence, filename)));
  const entries = unzipSync(bytes);
  const nativeParts = Object.entries(entries)
    .filter(([part]) => /^xl\/charts\/chart\d+\.xml$/.test(part))
    .map(([part, bytes]) => {
      const xml = strFromU8(bytes as Uint8Array);
      const valueAxes = Array.from(
        xml.matchAll(/<(?:\w+:)?valAx\b[^>]*>[\s\S]*?<\/(?:\w+:)?valAx>/g),
        (match) => {
          const axis = match[0];
          const tags = ["min", "max", "majorUnit"].map((tag) => ({
            tag,
            present: new RegExp(`<(?:\\w+:)?${tag}\\b`).test(axis),
          }));
          return { tags, noExplicitMinMaxMajorUnit: tags.every((tag) => !tag.present) };
        },
      );
      return {
        part,
        valueAxes,
        markerSymbols: Array.from(
          xml.matchAll(/<(?:\w+:)?symbol\b[^>]*\bval="([^"]+)"/g),
          (match) => match[1],
        ),
      };
    });
  const { workbook, report } = await decodeXlsx(bytes);
  const charts: any[] = [];
  for (const sheet of workbook.sheets.values()) {
    for (const drawing of sheet.drawings ?? []) {
      if (drawing.kind !== "chart") continue;
      const { width, height } = drawing;
      const data = getSheetChartData(
        sheet,
        drawing.chart,
        createWorkbookEvaluator(workbook, sheet.id),
      );
      let option;
      try {
        option = createChartOption(drawing.chart, data, { width, height, theme: workbook.theme });
      } catch (error) {
        charts.push({
          width,
          height,
          chartType: drawing.chart.type,
          dataValues: data.series.map((series: any) => series.values),
          importedValueAxis: drawing.chart.format?.valueAxis ?? null,
          renderingError: {
            stage: "createChartOption at decoded native dimensions",
            name: error instanceof Error ? error.name : "unknown",
            message: error instanceof Error ? error.message : String(error),
          },
          wpsObservation: observed[name] ?? null,
          wpsObservationSource: observationSource,
          expectedWpsTicks: observed[name] ? expectedTicks(observed[name]!) : null,
          splitNumberOnlyMatches: null,
          note: "No SVG generated and no splitNumber probe performed; native-size product option generation rejected the chart. No title or dimension workaround applied.",
        });
        continue;
      }
      const originalAxis = option.yAxis as any;
      const { svg, result } = render(option, width, height);
      const svgPath = resolve(outputDir, `${filename.replace(/\.xlsx$/, "")}.svg`);
      await writeFile(svgPath, svg);
      const expected = observed[name] ? expectedTicks(observed[name]!) : null;
      const splitNumberProbes = [];
      for (let splitNumber = 1; splitNumber <= 20; splitNumber++) {
        const probe = { ...option, yAxis: { ...originalAxis, splitNumber } };
        const candidate = render(probe, width, height).result;
        splitNumberProbes.push({
          splitNumber,
          tickValues: candidate.tickValues,
          extent: candidate.extent,
          interval: candidate.interval,
          matchesWpsTicks: expected ? equal(candidate.tickValues, expected) : null,
        });
      }
      charts.push({
        width,
        height,
        chartType: drawing.chart.type,
        dataValues: data.series.map((series: any) => series.values),
        importedValueAxis: drawing.chart.format?.valueAxis ?? null,
        optionDomainProperties: Object.fromEntries(
          ["min", "max", "interval", "splitNumber", "scale", "boundaryGap"].map((key) => [
            key,
            { own: Object.hasOwn(originalAxis, key), value: originalAxis[key] ?? null },
          ]),
        ),
        seriesMarkers: option.series.map((series: any) => ({
          name: series.name,
          showSymbol: series.showSymbol ?? null,
          symbol: series.symbol ?? null,
          symbolSize: series.symbolSize ?? null,
        })),
        svgPath,
        current: result,
        wpsObservation: observed[name] ?? null,
        wpsObservationSource: observationSource,
        expectedWpsTicks: expected,
        currentMatchesWpsTicks: expected ? equal(result.tickValues, expected) : null,
        splitNumberOnlyProbeRange: "integers 1..20; no other option changed",
        splitNumberOnlyMatches: splitNumberProbes
          .filter((probe) => probe.matchesWpsTicks)
          .map((probe) => probe.splitNumber),
        splitNumberProbes,
      });
    }
  }
  results.push({
    filename,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    nativeParts,
    importIssues: report.issues,
    importedChartCount: charts.length,
    charts,
  });
}
// Source-backed, in-memory negative control. This is NOT WPS-produced evidence.
const squareParts = unzipSync(
  new Uint8Array(await readFile(resolve(evidence, "auto-axis-base120.xlsx"))),
);
const originalChartXml = strFromU8(squareParts["xl/charts/chart1.xml"]!);
const squareChartXml = originalChartXml.replace(
  '<c:symbol val="circle"/>',
  '<c:symbol val="square"/>',
);
if (squareChartXml === originalChartXml)
  throw new Error("Square probe did not change its one leaf.");
squareParts["xl/charts/chart1.xml"] = strToU8(squareChartXml);
const squareRead = await decodeXlsx(zipSync(squareParts));
const squareMarkerAudit = {
  method:
    "In-memory synthetic clone of base120; first c:symbol circle changed to square. Original file unchanged. Not a WPS-produced square fixture.",
  importedChartCount: [...squareRead.workbook.sheets.values()].reduce(
    (count, sheet) =>
      count + (sheet.drawings ?? []).filter((drawing) => drawing.kind === "chart").length,
    0,
  ),
  importIssues: squareRead.report.issues,
  findings: [
    "Core ChartSeriesFormat has markers and markerSizePt, but no marker-shape field.",
    "column-chart-reader.ts accepts only circle or none; other shape adds a markers style-omitted issue and throws; its catch records feature-omitted and does not add the chart.",
    "column-chart-xml.ts emits none or circle only.",
    "chart-format-render.ts maps explicit markers true to ECharts circle and false to none.",
    "Thus square is currently a chart import-admission boundary, not an admitted shape silently approximated as circle.",
  ],
  sources: [
    "packages/core/src/chart-format.ts:65-78",
    "packages/xlsx-io/src/column-chart-reader.ts:264-275,340-346",
    "packages/xlsx-io/src/column-chart-xml.ts:106-109",
    "apps/web/src/modules/charts/chart-format-render.ts:483-489",
  ],
};
const summary = {
  generatedAt: new Date().toISOString(),
  repo,
  sourceMode: "Current TypeScript product source; @sheetcraft/core imports mapped to src",
  renderer: "Actual product chart-runtime ECharts SVG SSR at decoded native drawing dimensions",
  references: {
    realSvgRegression: "apps/web/src/tests/modules/charts/native-line-series-styles.test.ts",
    chartOption: "apps/web/src/modules/charts/chart-option.ts",
    valueAxisFormat: "apps/web/src/modules/charts/chart-format-render.ts",
  },
  caution: [
    "WPS observations were read from actual WPS screenshots, not generated by this script.",
    "This is SSR SVG, not a browser screenshot or a claim of WPS-identical font metrics.",
    "splitNumber probes are diagnostic copies only; no product code or workbook is changed.",
    "The saved copy observation is inherited from its measured original unless separately verified.",
  ],
  conclusions: [
    "Native source and saved-copy min/max/majorUnit absence is verified per value-axis XML, not inferred from the charts.",
    "Changing splitNumber alone cannot explain this matrix: the narrow range still includes zero, and a 20-unit interval rounds a 120 maximum to 120, not to WPS's 140.",
    "The integer splitNumber 1..20 sweep only matches max121 among the nine original matrix cases whose native-size option generation succeeds. Saved copies are reported separately alongside their original observation.",
    "The 200px-height cases are blocked by current axis-title layout validation before ECharts rendering; no successful native-size tick result is claimed.",
    "WPS's zero-inclusion threshold, headroom rule, automatic interval rule and exact layout dependence remain unestablished by this matrix. No formula or product fix is proposed.",
  ],
  echartsSourceEvidence: {
    niceExtent:
      "node_modules/.bun/echarts@6.1.0/node_modules/echarts/lib/coord/axisNiceTicks.js:80-84 rounds automatic maximum with ceil(max / autoInterval) * autoInterval.",
    includeZero:
      "node_modules/.bun/echarts@6.1.0/node_modules/echarts/lib/coord/scaleRawExtentInfo.js:153-158 includes zero for an unfixed positive value-axis minimum when needIncludeZero is true.",
    splitNumber:
      "node_modules/.bun/echarts@6.1.0/node_modules/echarts/lib/coord/axisNiceTicks.js:95-103 uses splitNumber to choose interval, not as a separate headroom policy.",
  },
  squareMarkerAudit,
  results,
};
const jsonPath = resolve(evidence, "current-svg-matrix.json");
await writeFile(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      jsonPath,
      files: results.map((file) => ({
        filename: file.filename,
        importedChartCount: file.importedChartCount,
        charts: file.charts.map((chart) => ({
          dimensions: [chart.width, chart.height],
          actual: chart.current?.tickValues ?? null,
          renderingError: chart.renderingError ?? null,
          expected: chart.expectedWpsTicks,
          splitNumberOnlyMatches: chart.splitNumberOnlyMatches,
          svgPath: chart.svgPath,
        })),
      })),
    },
    null,
    2,
  ),
);
