import { strFromU8, strToU8, type Unzipped } from "fflate/browser";
import { parseFormulaReference } from "@idea10/core/formula";
import { getCellAddressLabel, parseCellAddress } from "@idea10/core/coordinates";
import { normalizeCellSparkline, type CellSparkline } from "@idea10/core/sparklines";
import type { Sheet } from "@idea10/core/workbook";
import { readXlsxWorksheetPartTargets } from "./raw-cell-values.js";
const URI = "{05C60535-1F16-4fd2-B633-F4F36F0B64E0}";
function escape(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!,
  );
}
function decode(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, name: string) =>
    name.startsWith("#")
      ? String.fromCodePoint(
          Number.parseInt(
            name.startsWith("#x") ? name.slice(2) : name.slice(1),
            name.startsWith("#x") ? 16 : 10,
          ),
        )
      : ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[name] ?? ""),
  );
}
function attr(value: string, name: string): string | undefined {
  return new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(value)?.[1];
}
export function writeXlsxSparklines(entries: Unzipped, sheets: readonly Sheet[]): void {
  const parts = readXlsxWorksheetPartTargets(entries);
  sheets.forEach((sheet, index) => {
    const part = parts[index];
    if (!part || !entries[part]) return;
    const groups = [...sheet.cells].flatMap(([key, cell]) => {
      if (!cell.sparkline) return [];
      const spark = normalizeCellSparkline(cell.sparkline)!;
      const [row, column] = key.split(":").map(Number);
      const cellLabel = getCellAddressLabel({ row: row!, column: column! });
      const formula = spark.source
        ? `'${sheet.name.replaceAll("'", "''")}'!${getCellAddressLabel(spark.source.start)}:${getCellAddressLabel(spark.source.end)}`
        : "#REF!";
      return [
        `<x14:sparklineGroup type="${spark.type === "winLoss" ? "stacked" : spark.type}" displayEmptyCellsAs="${spark.empty === "connect" ? "span" : spark.empty}" markers="${Number(spark.markers)}" negative="1" displayXAxis="${Number(spark.axis)}" displayHidden="${Number(spark.showHidden)}"><x14:colorSeries rgb="FF${spark.color.slice(1).toUpperCase()}"/><x14:colorNegative rgb="FF${spark.negativeColor.slice(1).toUpperCase()}"/><x14:colorAxis rgb="FFA3A3A3"/><x14:colorMarkers rgb="FF${spark.color.slice(1).toUpperCase()}"/><x14:sparklines><x14:sparkline><xm:f>${escape(formula)}</xm:f><xm:sqref>${cellLabel}</xm:sqref></x14:sparkline></x14:sparklines></x14:sparklineGroup>`,
      ];
    });
    if (!groups.length) return;
    let xml = strFromU8(entries[part]!);
    const extension = `<ext uri="${URI}" xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main"><x14:sparklineGroups xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main">${groups.join("")}</x14:sparklineGroups></ext>`;
    if (/<extLst\b[^>]*\/>/.test(xml))
      xml = xml.replace(/<extLst\b[^>]*\/>/, `<extLst>${extension}</extLst>`);
    else if (xml.includes("</extLst>")) xml = xml.replace("</extLst>", `${extension}</extLst>`);
    else xml = xml.replace("</worksheet>", `<extLst>${extension}</extLst></worksheet>`);
    entries[part] = strToU8(xml);
  });
}
export function readXlsxSparklines(
  entries: Unzipped,
  sheetNames: readonly string[],
  omitted?: (index: number, reference: string) => void,
): Array<Map<string, CellSparkline>> {
  return readXlsxWorksheetPartTargets(entries).map((part, index) => {
    const result = new Map<string, CellSparkline>();
    const bytes = entries[part];
    if (!bytes) return result;
    const xml = strFromU8(bytes);
    for (const group of xml.matchAll(
      /<(?:\w+:)?sparklineGroup\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?sparklineGroup>/g,
    )) {
      const attributes = group[1]!,
        body = group[2]!;
      const color = (name: string, fallback: string) => {
        const match = new RegExp(`<(?:\\w+:)?${name}\\b([^>]*)`).exec(body);
        const rgb = match ? attr(match[1]!, "rgb") : undefined;
        return rgb && /^(?:[0-9a-f]{2})?[0-9a-f]{6}$/i.test(rgb)
          ? `#${rgb.slice(-6).toLowerCase()}`
          : fallback;
      };
      for (const item of body.matchAll(
        /<(?:\w+:)?sparkline\b[^>]*>([\s\S]*?)<\/(?:\w+:)?sparkline>/g,
      )) {
        const reference =
          /<(?:\w+:)?sqref>([^<]*)<\//.exec(item[1]!)?.[1]?.trim().replaceAll("$", "") ?? "";
        try {
          if (!parseCellAddress(reference)) throw new Error("Invalid target.");
          const formula = decode(/<(?:\w+:)?f>([^<]*)<\//.exec(item[1]!)?.[1] ?? "");
          const parsed =
            formula === "#REF!"
              ? undefined
              : parseFormulaReference(formula, {
                  currentSheetId: String(index),
                  resolveSheetId: (name) => {
                    const found = sheetNames.findIndex(
                      (sheetName) => sheetName.toLowerCase() === name.toLowerCase(),
                    );
                    return found < 0 ? undefined : String(found);
                  },
                });
          if (formula !== "#REF!" && (!parsed || parsed.target.sheetId !== String(index)))
            throw new Error("External source.");
          const type = attr(attributes, "type") ?? "line";
          const empty = attr(attributes, "displayEmptyCellsAs") ?? "zero";
          const flag = (name: string) => ["1", "true"].includes(attr(attributes, name) ?? "0");
          const sparkline = normalizeCellSparkline({
            type: type === "stacked" ? "winLoss" : (type as CellSparkline["type"]),
            source: parsed?.target.range ?? null,
            color: color("colorSeries", "#2563eb"),
            negativeColor: flag("negative")
              ? color("colorNegative", "#ef4444")
              : color("colorSeries", "#2563eb"),
            markers: flag("markers"),
            axis: flag("displayXAxis"),
            showHidden: flag("displayHidden"),
            empty: empty === "span" ? "connect" : (empty as CellSparkline["empty"]),
          })!;
          result.set(reference.toUpperCase(), sparkline);
          if (
            ["first", "last", "high", "low", "dateAxis", "rightToLeft"].some(flag) ||
            attr(attributes, "manualMin") ||
            attr(attributes, "manualMax")
          )
            omitted?.(index, reference);
        } catch {
          omitted?.(index, reference);
        }
      }
    }
    return result;
  });
}
