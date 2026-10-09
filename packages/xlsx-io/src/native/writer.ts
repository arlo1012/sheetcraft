import { strToU8, zipSync, type Zippable } from "fflate/browser";
import { MAIN_NS, PACKAGE_NS, REL_NS, addRelationship, xml } from "../pivot-xml.js";
import type { NativeCell, NativeSheetData, NativeWorkbookData } from "./model.js";
import { NativeStyleWriter } from "./writer-styles.js";
import { writeNativeSheetAttachments, type NativePartType } from "./writer-attachments.js";
import { xlsxText } from "./writer-text.js";
import { writeNativeDefaultTheme } from "./writer-theme.js";
import { assertNativeWorksheetName } from "./writer-names.js";

const HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const CONTENT_NS = "http://schemas.openxmlformats.org/package/2006/content-types";
const SPREADSHEET_CONTENT = "application/vnd.openxmlformats-officedocument.spreadsheetml.";

function columnLabel(number: number): string {
  let label = "";
  for (let value = number; value > 0; value = Math.floor((value - 1) / 26))
    label = String.fromCharCode(65 + ((value - 1) % 26)) + label;
  return label;
}

function dateSerial(date: Date, date1904: boolean): number {
  const days = date.getTime() / 86_400_000;
  if (!Number.isFinite(days)) throw new Error("Invalid XLSX date value.");
  if (date1904) return days + 24_107;
  const serial = days + 25_569;
  // Excel's fictitious 1900-02-29 occupies serial 60.
  return serial < 61 ? serial - 1 : serial;
}

function scalarValue(value: unknown, date1904: boolean): { type?: string; content: string } {
  if (value === undefined || value === null) return { content: "" };
  if (value instanceof Date) return { content: `<v>${dateSerial(value, date1904)}</v>` };
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return { type: "e", content: "<v>#NUM!</v>" };
    return { content: `<v>${value}</v>` };
  }
  if (typeof value === "boolean") return { type: "b", content: `<v>${value ? 1 : 0}</v>` };
  if (typeof value === "string") return { type: "str", content: `<v>${xlsxText(value)}</v>` };
  if (typeof value === "object" && "error" in value && typeof value.error === "string")
    return { type: "e", content: `<v>${xlsxText(value.error)}</v>` };
  throw new Error("Unsupported native XLSX cell value.");
}

function cellXml(cell: NativeCell, styles: NativeStyleWriter, date1904: boolean): string {
  const styleId = styles.cellStyle(cell);
  const attrs = ` r="${xml(cell.address)}"${styleId ? ` s="${styleId}"` : ""}`;
  const record =
    cell.value && typeof cell.value === "object"
      ? (cell.value as Record<string, unknown>)
      : undefined;
  const formula =
    cell.formula ?? (typeof record?.formula === "string" ? record.formula : undefined);
  if (formula !== undefined) {
    const cached = scalarValue(cell.result !== undefined ? cell.result : record?.result, date1904);
    return `<c${attrs}${cached.type ? ` t="${cached.type}"` : ""}><f>${xml(formula.startsWith("=") ? formula.slice(1) : formula)}</f>${cached.content}</c>`;
  }
  let value = cell.value;
  if (Array.isArray(record?.richText))
    value = record.richText
      .map((run) => (typeof run === "object" && run && "text" in run ? String(run.text) : ""))
      .join("");
  else if (typeof record?.text === "string") value = record.text;
  if (typeof value === "string")
    return `<c${attrs} t="inlineStr"><is><t xml:space="preserve">${xlsxText(value)}</t></is></c>`;
  const scalar = scalarValue(value, date1904);
  // Feature finalizers append style bindings to opening tags. Keep empty cells
  // paired too, so they never append an attribute after a self-closing slash.
  return `<c${attrs}${scalar.type ? ` t="${scalar.type}"` : ""}>${scalar.content}</c>`;
}

function sheetViewsXml(sheet: NativeSheetData): string {
  const views = sheet.views?.length ? sheet.views : [{}];
  return `<sheetViews>${views
    .map((view) => {
      let attrs = ' workbookViewId="0"';
      for (const key of [
        "showGridLines",
        "showRowColHeaders",
        "showRuler",
        "rightToLeft",
        "tabSelected",
      ])
        if (typeof view[key] === "boolean") attrs += ` ${key}="${view[key] ? 1 : 0}"`;
      for (const key of ["zoomScale", "zoomScaleNormal"])
        if (typeof view[key] === "number") attrs += ` ${key}="${view[key]}"`;
      if (typeof view.style === "string") attrs += ` view="${xml(view.style)}"`;
      const x = typeof view.xSplit === "number" ? view.xSplit : 0;
      const y = typeof view.ySplit === "number" ? view.ySplit : 0;
      if ((view.state !== "frozen" && view.state !== "split") || (!x && !y))
        return `<sheetView${attrs}/>`;
      const pane =
        typeof view.activePane === "string"
          ? view.activePane
          : x && y
            ? "bottomRight"
            : x
              ? "topRight"
              : "bottomLeft";
      const topLeft =
        typeof view.topLeftCell === "string" ? view.topLeftCell : `${columnLabel(x + 1)}${y + 1}`;
      const activeCell = typeof view.activeCell === "string" ? view.activeCell : topLeft;
      const splits = `${x ? ` xSplit="${x}"` : ""}${y ? ` ySplit="${y}"` : ""}`;
      return `<sheetView${attrs}><pane${splits} topLeftCell="${xml(topLeft)}" activePane="${xml(pane)}" state="${view.state}"/><selection pane="${xml(pane)}" activeCell="${xml(activeCell)}" sqref="${xml(activeCell)}"/></sheetView>`;
    })
    .join("")}</sheetViews>`;
}

function dimension(sheet: NativeSheetData): string {
  let top = Infinity,
    left = Infinity,
    bottom = 0,
    right = 0;
  const include = (address: string) => {
    const match = /^([A-Z]+)([1-9]\d*)$/i.exec(address);
    if (!match) throw new Error(`Invalid XLSX cell address: ${address}.`);
    const column = [...match[1]!.toUpperCase()].reduce(
      (value, letter) => value * 26 + letter.charCodeAt(0) - 64,
      0,
    );
    const row = Number(match[2]);
    top = Math.min(top, row);
    left = Math.min(left, column);
    bottom = Math.max(bottom, row);
    right = Math.max(right, column);
  };
  for (const row of sheet.rows.values())
    for (const cell of row.cells.values()) include(cell.address);
  for (const merge of sheet.merges) for (const endpoint of merge.split(":")) include(endpoint);
  if (!bottom) return "A1";
  const start = `${columnLabel(left)}${top}`;
  const end = `${columnLabel(right)}${bottom}`;
  return start === end ? start : `${start}:${end}`;
}

function autoFilterXml(filter: unknown): string {
  if (typeof filter === "string") return `<autoFilter ref="${xml(filter)}"/>`;
  if (!filter || typeof filter !== "object") return "";
  const record = filter as Record<string, unknown>;
  const endpoint = (value: unknown): string | undefined => {
    if (typeof value === "string") return value;
    if (!value || typeof value !== "object") return undefined;
    const address = value as Record<string, unknown>;
    return typeof address.row === "number" && typeof address.column === "number"
      ? `${columnLabel(address.column)}${address.row}`
      : undefined;
  };
  const start = endpoint(record.from),
    end = endpoint(record.to);
  return start && end ? `<autoFilter ref="${xml(`${start}:${end}`)}"/>` : "";
}

function sheetXml(
  sheet: NativeSheetData,
  styles: NativeStyleWriter,
  date1904: boolean,
  attachments: { drawing?: string; legacyDrawing?: string },
): string {
  const properties = sheet.properties.tabColor
    ? `<sheetPr>${`<tabColor rgb="${xml(sheet.properties.tabColor.argb)}"/>`}</sheetPr>`
    : "";
  const format = `<sheetFormatPr defaultRowHeight="${sheet.properties.defaultRowHeight ?? 15}"${sheet.properties.defaultColWidth !== undefined ? ` defaultColWidth="${sheet.properties.defaultColWidth}"` : ""}/>`;
  const columns = [...sheet.columns.values()]
    .sort((a, b) => a.number - b.number)
    .filter((column) => column.width !== undefined || column.hidden !== undefined);
  const cols = columns.length
    ? `<cols>${columns.map((column) => `<col min="${column.number}" max="${column.number}"${column.width !== undefined ? ` width="${column.width}"` : ""}${column.hidden ? ' hidden="1"' : ""}${column.width !== undefined ? ' customWidth="1"' : ""}/>`).join("")}</cols>`
    : "";
  const rows = [...sheet.rows.values()]
    .sort((a, b) => a.number - b.number)
    .filter((row) => row.cells.size || row.height !== undefined || row.hidden);
  const data = rows
    .map((row) => {
      const attrs = ` r="${row.number}"${row.height !== undefined ? ` ht="${row.height}" customHeight="1"` : ""}${row.hidden ? ' hidden="1"' : ""}`;
      const cells = [...row.cells.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, cell]) => cellXml(cell, styles, date1904))
        .join("");
      return `<row${attrs}>${cells}</row>`;
    })
    .join("");
  const merges = sheet.merges.length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((ref) => `<mergeCell ref="${xml(ref)}"/>`).join("")}</mergeCells>`
    : "";
  return `${HEADER}<worksheet xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">${properties}<dimension ref="${dimension(sheet)}"/>${sheetViewsXml(sheet)}${format}${cols}<sheetData>${data}</sheetData>${autoFilterXml(sheet.autoFilter)}${merges}<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>${attachments.drawing ? `<drawing r:id="${attachments.drawing}"/>` : ""}${attachments.legacyDrawing ? `<legacyDrawing r:id="${attachments.legacyDrawing}"/>` : ""}</worksheet>`;
}

function workbookXml(workbook: NativeWorkbookData, sheetIds: string[]): string {
  const views = (workbook.views?.length ? workbook.views : [{}])
    .map((view) => {
      const attrs = ["x", "y", "width", "height", "activeTab", "firstSheet", "visibility"]
        .filter((key) => view[key] !== undefined)
        .map((key) => {
          const name =
            (
              {
                x: "xWindow",
                y: "yWindow",
                width: "windowWidth",
                height: "windowHeight",
              } as Record<string, string>
            )[key] ?? key;
          return ` ${name}="${xml(view[key])}"`;
        })
        .join("");
      return `<workbookView${attrs}/>`;
    })
    .join("");
  const sheets = workbook.sheets
    .map(
      (sheet, index) =>
        `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="${sheetIds[index]}"/>`,
    )
    .join("");
  return `${HEADER}<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}"><fileVersion appName="Sheetcraft"/><workbookPr date1904="${workbook.properties.date1904 ? 1 : 0}"/><bookViews>${views}</bookViews><sheets>${sheets}</sheets><calcPr calcId="171027" fullCalcOnLoad="${workbook.calcProperties.fullCalcOnLoad ? 1 : 0}"/></workbook>`;
}

/** Generate the package directly; higher-level feature writers extend these parts. */
export function writeNativeWorkbook(workbook: NativeWorkbookData): Uint8Array {
  const sheetNames: string[] = [];
  for (const sheet of workbook.sheets) {
    assertNativeWorksheetName(sheet.name, sheetNames);
    sheetNames.push(sheet.name);
  }
  const entries: Record<string, Uint8Array> = {};
  const styles = new NativeStyleWriter();
  const partTypes: NativePartType[] = [
    { part: "xl/workbook.xml", contentType: `${SPREADSHEET_CONTENT}sheet.main+xml` },
    { part: "xl/styles.xml", contentType: `${SPREADSHEET_CONTENT}styles+xml` },
    {
      part: "xl/theme/theme1.xml",
      contentType: "application/vnd.openxmlformats-officedocument.theme+xml",
    },
  ];
  const sheetIds = workbook.sheets.map((sheet, index) => {
    const number = index + 1;
    const part = `xl/worksheets/sheet${number}.xml`;
    const attachments = writeNativeSheetAttachments(entries, sheet, workbook.images, number);
    entries[part] = strToU8(
      sheetXml(sheet, styles, Boolean(workbook.properties.date1904), attachments),
    );
    partTypes.push(
      { part, contentType: `${SPREADSHEET_CONTENT}worksheet+xml` },
      ...attachments.partTypes,
    );
    return addRelationship(
      entries,
      "xl/workbook.xml",
      "worksheet",
      `worksheets/sheet${number}.xml`,
    );
  });
  addRelationship(entries, "xl/workbook.xml", "styles", "styles.xml");
  addRelationship(entries, "xl/workbook.xml", "theme", "theme/theme1.xml");
  writeNativeDefaultTheme(entries);
  entries["xl/workbook.xml"] = strToU8(workbookXml(workbook, sheetIds));
  entries["xl/styles.xml"] = strToU8(styles.xml());
  entries["_rels/.rels"] = strToU8(
    `${HEADER}<Relationships xmlns="${PACKAGE_NS}"><Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  const mediaExtensions = new Set<string>();
  for (const [index, image] of workbook.images.entries()) {
    entries[`xl/media/image${index + 1}.${image.extension}`] = image.buffer;
    mediaExtensions.add(image.extension);
  }
  const defaults =
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="vml" ContentType="application/vnd.openxmlformats-officedocument.vmlDrawing"/>' +
    [...mediaExtensions]
      .map((extension) => `<Default Extension="${extension}" ContentType="image/${extension}"/>`)
      .join("");
  entries["[Content_Types].xml"] = strToU8(
    `${HEADER}<Types xmlns="${CONTENT_NS}">${defaults}${partTypes.map(({ part, contentType }) => `<Override PartName="/${part}" ContentType="${contentType}"/>`).join("")}</Types>`,
  );
  const files: Zippable = {};
  for (const [name, bytes] of Object.entries(entries))
    files[name] = [bytes, { level: name.startsWith("xl/media/") ? 0 : 6 }];
  return zipSync(files);
}
