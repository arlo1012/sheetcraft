import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { createSetPivotTableCommand } from "@sheetcraft/core/commands";
import { createWorkbookSession, executeWorkbookCommand } from "@sheetcraft/core/history";
import { getPivotDetails } from "@sheetcraft/core/pivot-tables";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { serializeWorkbook, deserializeWorkbook } from "@sheetcraft/core/serialization";
import { getSheetChartData } from "@sheetcraft/core/sheet-charts";
import {
  createSheet,
  createWorkbookEvaluator,
  getCellValue,
  insertSheet,
  setCellContent,
  type Workbook,
} from "@sheetcraft/core/workbook";
import { decodeXlsx, encodeXlsx, XlsxCompatibilityError } from "../../index.js";
import { nativeChartFixture } from "./native-chart-fixture.js";

async function producer(name = "native-created") {
  return new Uint8Array(
    await readFile(
      new URL(
        `../../../../../docs/acceptance/evidence/wps-pivotchart-producer-20261010/${name}.xlsx`,
        import.meta.url,
      ),
    ),
  );
}
function importedChart(workbook: Workbook, name: string) {
  const sheet = [...workbook.sheets.values()].find((sheet) => sheet.name === name)!;
  const drawing = sheet.drawings?.find((drawing) => drawing.kind === "chart");
  if (!drawing || drawing.kind !== "chart") throw new Error("Missing imported chart.");
  const data = getSheetChartData(sheet, drawing.chart, createWorkbookEvaluator(workbook, sheet.id));
  return { sheet, drawing, data };
}
function edit(
  entries: Record<string, Uint8Array>,
  part: string,
  change: (source: string) => string,
) {
  const before = strFromU8(entries[part]!);
  const after = change(before);
  if (before === after) throw new Error(`No-op test mutation: ${part}`);
  entries[part] = strToU8(after);
}
const wpsSavedChartProperties =
  '<c:extLst><c:ext uri="{0b15fc19-7d7d-44ad-8c2d-2c3a37ce22c3}"><chartProps xmlns="https://web.wps.cn/et/2018/main" chartId="{00000000-1111-2222-3333-444444444444}"/></c:ext></c:extLst>';
async function wpsSavedVariant(extension = wpsSavedChartProperties) {
  const fixture = nativeChartFixture();
  const entries = unzipSync((await encodeXlsx(fixture.workbook)).bytes);
  edit(entries, "xl/charts/chart1.xml", (xml) =>
    xml.replace("</c:chart>", `${extension}</c:chart>`),
  );
  edit(entries, "xl/drawings/drawing1.xml", (xml) =>
    xml.replace('<a:off x="0" y="0"/>', '<a:off x="1660525" y="1320800"/>'),
  );
  return { entries, fixture };
}

describe("bounded native linked clustered-column PivotChart import", () => {
  test("imports the observed WPS save-only properties leaf and absolute one-cell frame", async () => {
    const { entries, fixture } = await wpsSavedVariant();
    const result = await decodeXlsx(zipSync(entries));
    const { drawing, data } = importedChart(result.workbook, fixture.output.name);
    expect(drawing.chart.pivotTableId).toBe(fixture.pivot.id);
    expect(data.categories).toEqual(["east", "north", "south"]);
    expect(data.series[0]!.values).toEqual([60, 100, 120]);
    expect(
      result.report.issues.some(
        (issue) =>
          issue.code === "dimension-approximated" &&
          issue.locations.includes("xl/drawings/drawing1.xml"),
      ),
    ).toBe(true);
    expect(
      importedChart(
        (await decodeXlsx((await encodeXlsx(result.workbook)).bytes)).workbook,
        fixture.output.name,
      ).data,
    ).toEqual(data);
  });

  test.each([
    wpsSavedChartProperties.replace("{0b15fc19-7d7d-44ad-8c2d-2c3a37ce22c3}", "unknown"),
    wpsSavedChartProperties.replace("https://web.wps.cn/et/2018/main", "urn:unknown"),
    wpsSavedChartProperties.replace("{00000000-1111-2222-3333-444444444444}", "not-a-guid"),
    wpsSavedChartProperties.replace(' chartId="{00000000-1111-2222-3333-444444444444}"', ""),
    wpsSavedChartProperties.replace("chartId=", 'other="unexpected" chartId='),
    wpsSavedChartProperties.replace(" uri=", ' target="unknown" uri='),
    wpsSavedChartProperties.replace("/></c:ext>", "><payload/></chartProps></c:ext>"),
    wpsSavedChartProperties.replace("/></c:ext>", ">text</chartProps></c:ext>"),
    wpsSavedChartProperties.replace("</c:extLst>", '<c:ext uri="unknown"/></c:extLst>'),
  ])("keeps unrecognized WPS extension variants blocked (%#)", async (extension) => {
    const { entries } = await wpsSavedVariant(extension);
    await expect(decodeXlsx(zipSync(entries))).rejects.toBeInstanceOf(XlsxCompatibilityError);
  });

  test("does not admit the properties leaf outside the observed chart extension location", async () => {
    const { entries } = await wpsSavedVariant();
    edit(entries, "xl/charts/chart1.xml", (xml) =>
      xml
        .replace(wpsSavedChartProperties, "")
        .replace("</c:chartSpace>", `${wpsSavedChartProperties}</c:chartSpace>`),
    );
    await expect(decodeXlsx(zipSync(entries))).rejects.toBeInstanceOf(XlsxCompatibilityError);
  });

  test.each(["unmarked", "negative", "extent-mismatch"] as const)(
    "omits unproved absolute one-cell placement (%s)",
    async (kind) => {
      const { entries, fixture } = await wpsSavedVariant();
      if (kind === "unmarked")
        edit(entries, "xl/charts/chart1.xml", (xml) => xml.replace(wpsSavedChartProperties, ""));
      else
        edit(entries, "xl/drawings/drawing1.xml", (xml) =>
          kind === "negative"
            ? xml.replace('x="1660525"', 'x="-1"')
            : xml.replace(/(<a:ext cx=")[^"]+/, "$110"),
        );
      const result = await decodeXlsx(zipSync(entries));
      expect(
        [...result.workbook.sheets.values()].find((sheet) => sheet.name === fixture.output.name)!
          .drawings ?? [],
      ).toHaveLength(0);
      expect(
        result.report.issues.some(
          (issue) =>
            issue.code === "feature-omitted" && issue.locations.includes("xl/charts/chart1.xml"),
        ),
      ).toBe(true);
    },
  );

  test.each([
    ["native-created", 100],
    ["native-source-edited-stale", 100],
    ["native-refreshed", 110],
  ] as const)(
    "imports %s from saved report/cache and retains native manual ordering",
    async (name, north) => {
      const { workbook, report } = await decodeXlsx(await producer(name));
      const { sheet, drawing, data } = importedChart(workbook, "Sheet2");
      expect(data.categories).toEqual(["east", "north", "south"]);
      expect(data.series.map((series) => series.name)).toEqual(["apple", "pear"]);
      expect(data.series.map((series) => series.values)).toEqual([
        [60, north, 120],
        [70, 80, 90],
      ]);
      expect(drawing.chart.pivotTableId).toBe(sheet.pivotTables![0]!.id);
      expect(drawing.chart.dataCache).toBeUndefined();
      expect(drawing).toMatchObject({ width: 4826000 / 9525, height: 288 });
      expect(report.issues.some((issue) => issue.code === "dimension-approximated")).toBe(true);
      expect(report.issues.some((issue) => issue.code === "style-omitted")).toBe(true);
      expect(
        report.issues.some(
          (issue) =>
            issue.code === "feature-omitted" && issue.locations.includes("xl/charts/chart1.xml"),
        ),
      ).toBe(false);
      expect(
        getPivotDetails(workbook, sheet.pivotTables![0]!, { row: 5, column: 1 }).records[0]!.slice(
          0,
          3,
        ),
      ).toEqual(["north", "apple", north]);
      const snapshot = serializeWorkbook(workbook);
      expect(snapshot.version).toBe(44);
      expect(importedChart(deserializeWorkbook(snapshot), "Sheet2").data).toEqual(data);
      const roundtrip = await decodeXlsx(
        (await encodeXlsx(workbook, { filename: "renamed.xlsx" })).bytes,
      );
      expect(importedChart(roundtrip.workbook, "Sheet2").data).toEqual(data);
    },
  );

  test("keeps a stale linked chart until the explicit Core refresh, including after snapshot reload", async () => {
    const decoded = await decodeXlsx(await producer("native-source-edited-stale"));
    const workbook = deserializeWorkbook(serializeWorkbook(decoded.workbook));
    const { sheet } = importedChart(workbook, "Sheet2");
    const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
    expect(importedChart(workbook, "Sheet2").data.series[0]!.values[1]).toBe(100);
    executeWorkbookCommand(session, createSetPivotTableCommand(sheet.id, sheet.pivotTables![0]!));
    expect(importedChart(workbook, "Sheet2").data.series[0]!.values[1]).toBe(110);
    expect(getCellValue(sheet, sheet.pivotTables![0]!.outputRange!.end)).toBe(530);
    expect(
      getPivotDetails(workbook, sheet.pivotTables![0]!, { row: 5, column: 1 }).records[0]![2],
    ).toBe(110);
  });

  test("imports own one-cell geometry and apostrophe title/references with genuine metadata-restored owner identity", async () => {
    const f = nativeChartFixture();
    f.output.name = "Sales O'Brien";
    if (f.chart.kind !== "chart") throw new Error("Missing fixture chart.");
    f.chart.chart.title = "Amount & volume";
    f.chart.offsetX = 3;
    f.chart.offsetY = 7;
    const result = await decodeXlsx((await encodeXlsx(f.workbook)).bytes);
    const { drawing, data } = importedChart(result.workbook, f.output.name);
    expect(drawing.chart).toMatchObject({ pivotTableId: "pivot", title: "Amount & volume" });
    expect(drawing).toMatchObject({
      anchor: f.chart.anchor,
      offsetX: 3,
      offsetY: 7,
      width: f.chart.width,
      height: f.chart.height,
    });
    expect(data.categories).toEqual(["east", "north", "south"]);
    expect(
      result.report.issues.some(
        (issue) =>
          issue.code === "dimension-approximated" &&
          issue.locations.includes("xl/drawings/drawing1.xml"),
      ),
    ).toBe(false);
  });

  test("resolves a deduplicated native name to the restored Core identity rather than display-name lookup", async () => {
    const f = nativeChartFixture();
    const other = createSheet("Other", "other");
    insertSheet(f.workbook, other);
    executeWorkbookCommand(
      f.session,
      createSetPivotTableCommand(
        other.id,
        { ...f.pivot, id: "other-pivot", outputRange: null },
        { chartId: "other-chart" },
      ),
    );
    const decoded = await decodeXlsx((await encodeXlsx(f.workbook)).bytes);
    expect(importedChart(decoded.workbook, "Other").drawing.chart.pivotTableId).toBe("other-pivot");
    expect(importedChart(decoded.workbook, "Report").drawing.chart.pivotTableId).toBe("pivot");
  });

  test("preserves sparse finite numeric chart caches as null values", async () => {
    const f = nativeChartFixture();
    setCellContent(f.source, { row: 1, column: 2 }, null);
    executeWorkbookCommand(
      f.session,
      createSetPivotTableCommand(f.output.id, {
        ...f.pivot,
        values: [{ ...f.pivot.values[0]!, aggregate: "average" }],
      }),
    );
    const encoded = await encodeXlsx(f.workbook);
    expect(
      strFromU8(unzipSync(encoded.bytes)["xl/charts/chart1.xml"]!).match(
        /<c:numCache>[\s\S]*?<\/c:numCache>/,
      )?.[0],
    ).not.toContain('<c:pt idx="1"><c:v>');
    const decoded = await decodeXlsx(encoded.bytes);
    expect(importedChart(decoded.workbook, "Report").data.series[0]!.values).toEqual([
      60,
      null,
      120,
    ]);
  });

  test("preserves own source-order refresh semantics instead of converting them to native manual members", async () => {
    const f = nativeChartFixture();
    executeWorkbookCommand(
      f.session,
      createSetPivotTableCommand(f.output.id, {
        ...f.pivot,
        sort: "source",
        sortFields: undefined,
      }),
    );
    const decoded = await decodeXlsx((await encodeXlsx(f.workbook)).bytes);
    const { sheet } = importedChart(decoded.workbook, "Report");
    expect(sheet.pivotTables![0]!.sortFields).toBeUndefined();
    expect(serializeWorkbook(decoded.workbook).version).toBe(43);
    const source = [...decoded.workbook.sheets.values()].find((sheet) => sheet.name === "Source")!;
    for (const [row, value] of [
      [1, "east"],
      [2, "east"],
      [5, "north"],
      [6, "north"],
    ] as const)
      setCellContent(source, { row, column: 0 }, { kind: "literal", value });
    expect(importedChart(decoded.workbook, "Report").data.categories).toEqual([
      "north",
      "south",
      "east",
    ]);
    const session = createWorkbookSession({
      workbook: decoded.workbook,
      idFactory: createSequentialIdFactory(),
    });
    executeWorkbookCommand(session, createSetPivotTableCommand(sheet.id, sheet.pivotTables![0]!));
    expect(importedChart(decoded.workbook, "Report").data.categories).toEqual([
      "east",
      "south",
      "north",
    ]);
  });

  test("admits a relationship-reachable drawing at an unconventional package path", async () => {
    const entries = unzipSync(await producer());
    entries["xl/charts/view.xml"] = entries["xl/drawings/drawing1.xml"]!;
    entries["xl/charts/_rels/view.xml.rels"] = entries["xl/drawings/_rels/drawing1.xml.rels"]!;
    delete entries["xl/drawings/drawing1.xml"];
    delete entries["xl/drawings/_rels/drawing1.xml.rels"];
    edit(entries, "xl/worksheets/_rels/sheet1.xml.rels", (xml) =>
      xml.replace("../drawings/drawing1.xml", "../charts/view.xml"),
    );
    edit(entries, "[Content_Types].xml", (xml) =>
      xml.replace("/xl/drawings/drawing1.xml", "/xl/charts/view.xml"),
    );
    const decoded = await decodeXlsx(zipSync(entries));
    expect(importedChart(decoded.workbook, "Sheet2").data.categories).toEqual([
      "east",
      "north",
      "south",
    ]);
  });

  test("supports two genuine chart frames on one owner and rejects numeric object-id aliases", async () => {
    const f = nativeChartFixture();
    f.output.drawings!.push({ ...f.chart, id: "second-chart" });
    const encoded = await encodeXlsx(f.workbook);
    const control = await decodeXlsx(encoded.bytes);
    expect(
      [...control.workbook.sheets.values()].find((sheet) => sheet.name === "Report")!.drawings,
    ).toHaveLength(2);
    const entries = unzipSync(encoded.bytes);
    edit(entries, "xl/drawings/drawing1.xml", (xml) =>
      xml.replace('cNvPr id="2"', 'cNvPr id="01"'),
    );
    await expect(decodeXlsx(zipSync(entries))).rejects.toBeInstanceOf(XlsxCompatibilityError);
  });

  test("rejects exact duplicate ZIP part names before any chart admission", async () => {
    const entries = unzipSync(await producer());
    entries["xl/drawings/aliasng1.xml"] = entries["xl/drawings/drawing1.xml"]!;
    const bytes = zipSync(entries, { level: 0 });
    const before = new TextEncoder().encode("xl/drawings/aliasng1.xml");
    const after = new TextEncoder().encode("xl/drawings/drawing1.xml");
    for (let offset = 0; offset <= bytes.length - before.length; offset++)
      if (before.every((byte, index) => bytes[offset + index] === byte)) bytes.set(after, offset);
    await expect(decodeXlsx(bytes)).rejects.toBeInstanceOf(XlsxCompatibilityError);
  });

  test.each([
    "cache-name",
    "cache-value",
    "cache-order",
    "point-duplicate",
    "point-index",
    "point-count",
    "nonfinite",
    "source-owner",
    "missing-owner",
    "missing-items",
    "reference-source",
    "negative-extent",
    "reversed-anchor",
  ])("omits %s without a partial or dangling drawing", async (kind) => {
    const entries = unzipSync(await producer());
    if (kind === "missing-items")
      edit(entries, "xl/pivotTables/pivotTable1.xml", (xml) =>
        xml.replace(/<rowItems\b[\s\S]*?<\/rowItems>/, ""),
      );
    else if (kind === "negative-extent")
      edit(entries, "xl/drawings/drawing1.xml", (xml) => xml.replace('cx="4826000"', 'cx="-1"'));
    else if (kind === "reversed-anchor")
      edit(entries, "xl/drawings/drawing1.xml", (xml) =>
        xml.replace("<xdr:row>21</xdr:row>", "<xdr:row>1</xdr:row>"),
      );
    else
      edit(entries, "xl/charts/chart1.xml", (xml) =>
        kind === "cache-name"
          ? xml.replace("<c:v>apple</c:v>", "<c:v>other</c:v>")
          : kind === "cache-value"
            ? xml.replace("<c:v>100</c:v>", "<c:v>999</c:v>")
            : kind === "cache-order"
              ? xml.replace("<c:v>east</c:v>", "<c:v>south</c:v>")
              : kind === "point-duplicate"
                ? xml.replace('<c:pt idx="1">', '<c:pt idx="0">')
                : kind === "point-index"
                  ? xml.replace('<c:pt idx="1">', '<c:pt idx="99999">')
                  : kind === "point-count"
                    ? xml.replace('<c:ptCount val="3"/>', '<c:ptCount val="999999999"/>')
                    : kind === "nonfinite"
                      ? xml.replace("<c:v>100</c:v>", "<c:v>Infinity</c:v>")
                      : kind === "source-owner"
                        ? xml.replace("]Sheet2!PivotTable1", "]Sheet1!PivotTable1")
                        : kind === "missing-owner"
                          ? xml.replace("]Sheet2!PivotTable1", "]Sheet2!Missing")
                          : xml.replace("Sheet2!$B$5:$B$8", "Sheet1!$B$5:$B$8"),
      );
    const { workbook, report } = await decodeXlsx(zipSync(entries));
    const sheet = [...workbook.sheets.values()].find((sheet) => sheet.name === "Sheet2")!;
    expect(sheet.drawings ?? []).toEqual([]);
    expect(sheet.pivotTables).toHaveLength(1);
    expect(
      report.issues.some(
        (issue) =>
          issue.code === "feature-omitted" && issue.locations.includes("xl/charts/chart1.xml"),
      ),
    ).toBe(true);
  });

  test.each([
    "pic",
    "extra-graphic",
    "orphan",
    "media",
    "spoof-type",
    "duplicate-id",
    "external",
    "network",
    "scheme",
    "missing-target",
    "drawing-namespace",
    "chart-namespace",
    "drawing-mime",
    "duplicate-mime",
    "style-root",
    "style-rels",
    "dtd",
    "utf16",
    "ordinary",
    "stacked",
    "extra-plot",
    "rotated",
    "case-alias",
    "unqualified-chart-id",
    "name-namespace",
    "legend-namespace",
    "nested-payload",
    "style-payload",
    "alternate-payload",
    "axis-id",
    "duplicate-frame-id",
    "extra-category-cache",
    "id-shadow",
    "worksheet-id",
    "worksheet-namespace",
    "empty-series",
    "string-anchor",
    "string-relation",
    "alternate-namespace",
    "nested-axis-payload",
    "frame-extent-namespace",
    "xml-id",
  ])("keeps %s outside the chart-only safety boundary", async (kind) => {
    const entries = unzipSync(await producer());
    if (kind === "pic")
      edit(entries, "xl/drawings/drawing1.xml", (xml) =>
        xml.replace("</xdr:twoCellAnchor>", "<xdr:pic/></xdr:twoCellAnchor>"),
      );
    else if (kind === "extra-graphic")
      edit(entries, "xl/drawings/drawing1.xml", (xml) =>
        xml.replace("</a:graphicData>", "<a:blip/></a:graphicData>"),
      );
    else if (kind === "orphan")
      entries["xl/drawings/unreferenced.xml"] = entries["xl/drawings/drawing1.xml"]!;
    else if (kind === "media") entries["xl/media/unreferenced.png"] = new Uint8Array([1]);
    else if (
      ["spoof-type", "duplicate-id", "external", "network", "scheme", "missing-target"].includes(
        kind,
      )
    )
      edit(entries, "xl/drawings/_rels/drawing1.xml.rels", (xml) =>
        kind === "spoof-type"
          ? xml.replace(
              "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart",
              "https://spoof.invalid/chart",
            )
          : kind === "duplicate-id"
            ? xml.replace(
                "</Relationships>",
                '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/></Relationships>',
              )
            : kind === "external"
              ? xml.replace(
                  'Target="../charts/chart1.xml"',
                  'TargetMode="External" Target="https://invalid.example/chart.xml"',
                )
              : kind === "network"
                ? xml.replace(
                    'Target="../charts/chart1.xml"',
                    'Target="//invalid.example/chart.xml"',
                  )
                : kind === "scheme"
                  ? xml.replace('Target="../charts/chart1.xml"', 'Target="a1:payload"')
                  : xml.replace('Target="../charts/chart1.xml"', 'Target="../charts/missing.xml"'),
      );
    else if (kind === "unqualified-chart-id")
      edit(entries, "xl/drawings/drawing1.xml", (xml) => xml.replace('r:id="rId1"', 'id="rId1"'));
    else if (kind === "name-namespace")
      edit(entries, "xl/charts/chart1.xml", (xml) => xml.replaceAll("c:name", "a:name"));
    else if (kind === "legend-namespace")
      edit(entries, "xl/charts/chart1.xml", (xml) => xml.replaceAll("c:legend", "a:legend"));
    else if (kind === "nested-payload")
      edit(entries, "xl/charts/chart1.xml", (xml) =>
        xml.replace("</c:chart>", '<a:pic/><c:externalData id="fake"/></c:chart>'),
      );
    else if (kind === "style-payload")
      edit(entries, "xl/charts/style1.xml", (xml) =>
        xml.replace("</cs:chartStyle>", '<a:blip embed="fake"/></cs:chartStyle>'),
      );
    else if (kind === "alternate-payload")
      edit(entries, "xl/charts/chart1.xml", (xml) =>
        xml.replace("</mc:Choice>", "<c:externalData/></mc:Choice>"),
      );
    else if (kind === "axis-id")
      edit(entries, "xl/charts/chart1.xml", (xml) =>
        xml.replace('axId val="493181554"', 'axId val="999"'),
      );
    else if (kind === "duplicate-frame-id")
      edit(entries, "xl/drawings/drawing1.xml", (xml) =>
        xml.replace(
          "</xdr:wsDr>",
          xml.match(/<xdr:twoCellAnchor>[\s\S]*?<\/xdr:twoCellAnchor>/)![0] + "</xdr:wsDr>",
        ),
      );
    else if (kind === "id-shadow")
      edit(entries, "xl/drawings/drawing1.xml", (xml) =>
        xml.replace('r:id="rId1"', 'r:id="missing" id="rId1"'),
      );
    else if (kind === "worksheet-id")
      edit(entries, "xl/worksheets/sheet1.xml", (xml) =>
        xml.replace(/(<drawing\b[^>]*?)r:id=/, "$1id="),
      );
    else if (kind === "worksheet-namespace")
      edit(entries, "xl/worksheets/sheet1.xml", (xml) =>
        xml.replace("<drawing ", '<drawing xmlns="urn:other" '),
      );
    else if (kind === "empty-series")
      edit(entries, "xl/charts/chart1.xml", (xml) =>
        xml.replace("</c:barChart>", "<c:ser/></c:barChart>"),
      );
    else if (kind === "string-anchor")
      edit(entries, "xl/drawings/drawing1.xml", (xml) =>
        xml.replace("</xdr:wsDr>", "<xdr:oneCellAnchor>ignored</xdr:oneCellAnchor></xdr:wsDr>"),
      );
    else if (kind === "string-relation")
      edit(entries, "xl/drawings/_rels/drawing1.xml.rels", (xml) =>
        xml.replace("</Relationships>", "<Relationship>ignored</Relationship></Relationships>"),
      );
    else if (kind === "alternate-namespace")
      edit(entries, "xl/charts/chart1.xml", (xml) =>
        xml
          .replaceAll("mc:AlternateContent", "c:AlternateContent")
          .replaceAll("mc:Choice", "c:Choice")
          .replaceAll("mc:Fallback", "c:Fallback"),
      );
    else if (kind === "nested-axis-payload")
      edit(entries, "xl/charts/chart1.xml", (xml) =>
        xml.replace("</c:catAx>", '<c:externalData id="fake"/></c:catAx>'),
      );
    else if (kind === "frame-extent-namespace")
      edit(entries, "xl/drawings/drawing1.xml", (xml) => xml.replaceAll("a:ext", "xdr:ext"));
    else if (kind === "extra-category-cache")
      edit(entries, "xl/charts/chart1.xml", (xml) =>
        xml.replace("</c:cat>", "<c:numLit/></c:cat>"),
      );
    else if (kind === "xml-id")
      edit(entries, "xl/drawings/drawing1.xml", (xml) =>
        xml.replace(
          'r:id="rId1"',
          'xmlns:xml="http://www.w3.org/XML/1998/namespace" xml:id="rId1"',
        ),
      );
    else if (kind === "drawing-namespace")
      edit(entries, "xl/drawings/drawing1.xml", (xml) =>
        xml.replace(
          "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
          "urn:spoof",
        ),
      );
    else if (kind === "chart-namespace")
      edit(entries, "xl/charts/chart1.xml", (xml) =>
        xml.replace("http://schemas.openxmlformats.org/drawingml/2006/chart", "urn:spoof"),
      );
    else if (kind === "drawing-mime")
      edit(entries, "[Content_Types].xml", (xml) =>
        xml.replace("application/vnd.openxmlformats-officedocument.drawing+xml", "application/xml"),
      );
    else if (kind === "duplicate-mime")
      edit(entries, "[Content_Types].xml", (xml) =>
        xml.replace(
          "</Types>",
          '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/xml"/></Types>',
        ),
      );
    else if (kind === "style-root")
      edit(entries, "xl/charts/style1.xml", (xml) => xml.replaceAll("chartStyle", "unknownStyle"));
    else if (kind === "style-rels")
      entries["xl/charts/_rels/style1.xml.rels"] = strToU8(
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="unused.xml"/></Relationships>',
      );
    else if (kind === "dtd")
      edit(
        entries,
        "xl/charts/style1.xml",
        (xml) => '<!DOCTYPE chartStyle [<!ENTITY bad "bad">]>' + xml,
      );
    else if (kind === "utf16")
      entries["xl/drawings/drawing1.xml"] = new Uint8Array([
        255,
        254,
        ...entries["xl/drawings/drawing1.xml"]!,
      ]);
    else if (kind === "ordinary")
      edit(entries, "xl/charts/chart1.xml", (xml) =>
        xml.replace(/<c:pivotSource>[\s\S]*?<\/c:pivotSource>/, ""),
      );
    else if (kind === "stacked")
      edit(entries, "xl/charts/chart1.xml", (xml) =>
        xml.replace('grouping val="clustered"', 'grouping val="stacked"'),
      );
    else if (kind === "extra-plot")
      edit(entries, "xl/charts/chart1.xml", (xml) =>
        xml.replace("</c:plotArea>", "<c:lineChart/></c:plotArea>"),
      );
    else if (kind === "rotated")
      edit(entries, "xl/drawings/drawing1.xml", (xml) =>
        xml.replace("<xdr:xfrm>", '<xdr:xfrm rot="1">'),
      );
    else entries["xl/drawings/DRAWING1.xml"] = entries["xl/drawings/drawing1.xml"]!;
    await expect(decodeXlsx(zipSync(entries))).rejects.toBeInstanceOf(XlsxCompatibilityError);
  });
});
