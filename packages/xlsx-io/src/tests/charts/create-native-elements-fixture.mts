import { mkdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { createHash } from "node:crypto";
import { encodeXlsx } from "../../../dist/index.js";
import { nativeElementsFixture } from "./native-elements-fixture.js";

const directory = process.argv[2];
if (!directory)
  throw new Error(
    "Usage: bun packages/xlsx-io/src/tests/charts/create-native-elements-fixture.mts OUTPUT_DIRECTORY",
  );
const output = resolve(directory);
await mkdir(output, { recursive: true });
const filename = "sheetcraft-c1-native-elements.xlsx";
const { workbook, cases } = nativeElementsFixture();
const encoded = await encodeXlsx(workbook, { filename });
if (
  encoded.report.issues.some(
    (issue) => issue.severity === "block" || issue.code === "feature-omitted",
  )
)
  throw new Error("The fixture must contain all editable charts without omission.");
const sha256 = createHash("sha256").update(encoded.bytes).digest("hex");
const expected = {
  filename,
  sha256,
  bytes: encoded.bytes.length,
  acceptance:
    "Pending actual Excel Online, WPS Online and WPS Desktop inspection; local roundtrip is not application acceptance.",
  source: {
    range: "A1:C4",
    categories: ["East", "North", "South"],
    series: [
      { name: "Apples", values: [60, -100, 0] },
      { name: "Pears", values: [70, 80, null] },
    ],
  },
  checks: [
    "Title and legend placement/overlay match the row.",
    "Column/bar labels match center/insideEnd/insideBase/outsideEnd, including negative and zero values.",
    "The chart is a selectable editable native chart, not an image.",
    "Change B2 from 60 to 61 and verify the plotted series updates; undo before saving baseline evidence.",
    "Change a supported title/legend/label setting, save a separate copy, inspect OOXML and reimport it; retain original fixture.",
  ],
  cases: cases.map((testCase, index) => ({
    sheet: testCase.sheet,
    objectName: testCase.sheet,
    objectId: `elements-${index}`,
    chartPart: `xl/charts/chart${index + 1}.xml`,
    type: testCase.type,
    title: testCase.title,
    titlePosition: testCase.title ? (testCase.elements?.titlePosition ?? "above") : "none",
    legend: testCase.legend,
    legendPosition: testCase.legend ? (testCase.elements?.legendPosition ?? "bottom") : null,
    legendOverlay: testCase.legend ? (testCase.elements?.legendOverlay ?? false) : null,
    labels: testCase.labels,
    labelPosition:
      testCase.labels && testCase.type !== "line"
        ? (testCase.elements?.labelPosition ?? "center")
        : null,
    dataTable: "none",
    labelContent: "value",
    labelScope: "all",
    apps: { excelOnline: "pending", wpsOnline: "pending", wpsDesktop: "pending" },
  })),
  report: encoded.report,
};
await writeFile(resolve(output, filename), encoded.bytes, { flag: "wx" });
await writeFile(resolve(output, "expected.json"), `${JSON.stringify(expected, null, 2)}\n`, {
  flag: "wx",
});
const header =
  "Sheet\tObject\tType\tTitle placement\tLegend\tOverlay\tLabels\tExcel Online\tWPS Online\tWPS Desktop";
const rows = expected.cases.map((item) =>
  [
    item.sheet,
    item.objectName,
    item.type,
    item.titlePosition,
    item.legendPosition ?? "none",
    item.legendOverlay ?? "n/a",
    item.labelPosition ?? (item.labels ? "value" : "off"),
    "pending",
    "pending",
    "pending",
  ].join("\t"),
);
await writeFile(resolve(output, "checklist.tsv"), `${[header, ...rows].join("\n")}\n`, {
  flag: "wx",
});
console.log(
  JSON.stringify(
    {
      output,
      filename: basename(filename),
      sha256,
      bytes: encoded.bytes.length,
      charts: cases.length,
    },
    null,
    2,
  ),
);
