import { strFromU8, strToU8, type Unzipped } from "fflate/browser";
import { parseFormulaReference } from "@sheetcraft/core/formula";
import { getCellAddressLabel, parseCellAddress } from "@sheetcraft/core/coordinates";
import {
  normalizeCellSparkline,
  type CellSparkline,
  type SparklinePointKind,
  type SparklinePointStyle,
} from "@sheetcraft/core/sparklines";
import type { Sheet } from "@sheetcraft/core/workbook";
import { readXlsxWorksheetPartTargets } from "./raw-cell-values.js";
import { appendNativeWorksheetExtension } from "./native/worksheet-order.js";
const URI = "{05C60535-1F16-4fd2-B633-F4F36F0B64E0}";
// CT_SparklineGroup requires this child-element order.
const pointFields = [
  ["firstPoint", "first", "colorFirst"],
  ["lastPoint", "last", "colorLast"],
  ["highPoint", "high", "colorHigh"],
  ["lowPoint", "low", "colorLow"],
] as const;
function colorElement(name: string, color: string): string {
  return `<x14:${name} rgb="FF${color.slice(1).toUpperCase()}"/>`;
}
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
    const grouped = new Map<string, { spark: CellSparkline; members: string[] }>();
    for (const [key, cell] of sheet.cells) {
      if (!cell.sparkline) continue;
      const spark = normalizeCellSparkline(cell.sparkline)!;
      const [row, column] = key.split(":").map(Number);
      const cellLabel = getCellAddressLabel({ row: row!, column: column! });
      const formula = spark.source
        ? `'${sheet.name.replaceAll("'", "''")}'!${getCellAddressLabel(spark.source.start)}:${getCellAddressLabel(spark.source.end)}`
        : "#REF!";
      const { source: _source, groupId: _groupId, ...style } = spark;
      const groupKey = JSON.stringify([
        spark.groupId ? "group" : "cell",
        spark.groupId ?? key,
        style,
      ]);
      let group = grouped.get(groupKey);
      if (!group) {
        group = { spark, members: [] };
        grouped.set(groupKey, group);
      }
      group.members.push(
        `<x14:sparkline><xm:f>${escape(formula)}</xm:f><xm:sqref>${cellLabel}</xm:sqref></x14:sparkline>`,
      );
    }
    const groups = [...grouped.values()].map(({ spark, members }) => {
      const axisAttributes = (["min", "max"] as const)
        .map((end) => {
          const limit = spark[end === "min" ? "minAxis" : "maxAxis"];
          return limit
            ? ` ${end}AxisType="${limit.type}"${limit.type === "custom" ? ` manual${end === "min" ? "Min" : "Max"}="${limit.value}"` : ""}`
            : "";
        })
        .join("");
      const directionAttribute =
        spark.rightToLeft === undefined ? "" : ` rightToLeft="${Number(spark.rightToLeft)}"`;
      const pointAttributes = pointFields
        .filter(([field]) => spark[field] !== undefined)
        .map(([field, attribute]) => ` ${attribute}="${Number(spark[field]!.show)}"`)
        .join("");
      const pointColors = pointFields
        .filter(([field]) => spark[field] !== undefined)
        .map(([field, , element]) => colorElement(element, spark[field]!.color))
        .join("");
      const negative = spark.negativePoints ?? (spark.type !== "line" || spark.markers);
      return `<x14:sparklineGroup type="${spark.type === "winLoss" ? "stacked" : spark.type}" displayEmptyCellsAs="${spark.empty === "connect" ? "span" : spark.empty}" markers="${Number(spark.markers)}" negative="${Number(negative)}" displayXAxis="${Number(spark.axis)}" displayHidden="${Number(spark.showHidden)}"${axisAttributes}${directionAttribute}${pointAttributes}>${colorElement("colorSeries", spark.color)}${colorElement("colorNegative", spark.negativeColor)}${colorElement("colorAxis", "#a3a3a3")}${colorElement("colorMarkers", spark.markerColor ?? spark.color)}${pointColors}<x14:sparklines>${members.join("")}</x14:sparklines></x14:sparklineGroup>`;
    });
    if (!groups.length) return;
    const xml = strFromU8(entries[part]!);
    const extension = `<ext uri="${URI}" xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main"><x14:sparklineGroups xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main">${groups.join("")}</x14:sparklineGroups></ext>`;
    entries[part] = strToU8(appendNativeWorksheetExtension(xml, extension));
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
    let groupSequence = 0;
    for (const group of xml.matchAll(
      /<(?:\w+:)?sparklineGroup\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?sparklineGroup>/g,
    )) {
      const groupId = `xlsx-sparkline-group-${++groupSequence}`;
      const attributes = group[1]!,
        body = group[2]!;
      const hasColor = (name: string) => new RegExp(`<(?:\\w+:)?${name}\\b`).test(body);
      const color = (name: string, fallback: string) => {
        const match = new RegExp(`<(?:\\w+:)?${name}\\b([^>]*)`).exec(body);
        const rgb = match ? attr(match[1]!, "rgb") : undefined;
        return rgb && /^(?:[0-9a-f]{2})?[0-9a-f]{6}$/i.test(rgb)
          ? `#${rgb.slice(-6).toLowerCase()}`
          : fallback;
      };
      const items = [
        ...body.matchAll(/<(?:\w+:)?sparkline\b[^>]*>([\s\S]*?)<\/(?:\w+:)?sparkline>/g),
      ];
      for (const item of items) {
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
          const points: Partial<Record<SparklinePointKind, SparklinePointStyle>> = {};
          const limits: Pick<CellSparkline, "minAxis" | "maxAxis"> = {};
          for (const end of ["min", "max"] as const) {
            const type = attr(attributes, `${end}AxisType`);
            if (type === undefined) continue;
            if (!["individual", "group", "custom"].includes(type))
              throw new Error("Invalid axis type.");
            const manual = attr(attributes, end === "min" ? "manualMin" : "manualMax");
            if (
              type === "custom" &&
              (manual === undefined || !manual.trim() || !Number.isFinite(Number(manual)))
            )
              throw new Error("Invalid axis value.");
            limits[end === "min" ? "minAxis" : "maxAxis"] =
              type === "custom"
                ? { type, value: Number(manual) }
                : { type: type as "individual" | "group" };
          }
          for (const [field, attribute, element] of pointFields) {
            if (attr(attributes, attribute) !== undefined || hasColor(element))
              points[field] = { show: flag(attribute), color: color(element, "#ef4444") };
          }
          const sparkline = normalizeCellSparkline({
            ...(items.length > 1 ? { groupId } : {}),
            type: type === "stacked" ? "winLoss" : (type as CellSparkline["type"]),
            source: parsed?.target.range ?? null,
            color: color("colorSeries", "#2563eb"),
            negativeColor: color("colorNegative", "#ef4444"),
            negativePoints: flag("negative"),
            ...(hasColor("colorMarkers")
              ? { markerColor: color("colorMarkers", color("colorSeries", "#2563eb")) }
              : {}),
            ...points,
            ...limits,
            ...(attr(attributes, "rightToLeft") !== undefined
              ? { rightToLeft: flag("rightToLeft") }
              : {}),
            markers: flag("markers"),
            axis: flag("displayXAxis"),
            showHidden: flag("displayHidden"),
            empty: empty === "span" ? "connect" : (empty as CellSparkline["empty"]),
          })!;
          result.set(reference.toUpperCase(), sparkline);
          if (flag("dateAxis")) omitted?.(index, reference);
        } catch {
          omitted?.(index, reference);
        }
      }
    }
    return result;
  });
}
