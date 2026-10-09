import { excelSerialToDateParts, type ExcelDateSystem } from "@idea10/core/formula";
import {
  getPivotGroupLabels,
  type PivotFieldGroup,
  type PivotDateGroupUnit,
} from "@idea10/core/pivot-tables";
import { strToU8 } from "fflate/browser";
import { readPivotCacheValue } from "./pivot-cache-values.js";
import { attr, child, nodes, parseXml, xml, type XmlNode } from "./pivot-xml.js";
export const nativePivotDateTime = (serial: number, system: ExcelDateSystem) => {
  const p = excelSerialToDateParts(serial, system);
  if (p.day === 0 || (p.year === 1900 && p.month === 2 && p.day === 29))
    throw new Error("Excel-only date boundaries cannot be written as XML dateTime.");
  return `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}T${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}:${String(p.second).padStart(2, "0")}.${String(p.millisecond).padStart(3, "0")}`;
};
export function nativePivotGroupXml(group: PivotFieldGroup, system: ExcelDateSystem): string {
  const range =
    group.kind === "number"
      ? ` startNum="${group.start}" endNum="${group.end}" groupInterval="${group.interval}"`
      : ` groupBy="${group.unit}" startDate="${nativePivotDateTime(group.start, system)}" endDate="${nativePivotDateTime(group.end, system)}"${group.unit === "days" ? ` groupInterval="${group.interval}"` : ""}`;
  const labels = getPivotGroupLabels(group, system);
  return `<fieldGroup base="${group.field}"><rangePr autoStart="${group.autoStart ? 1 : 0}" autoEnd="${group.autoEnd ? 1 : 0}"${range}/><groupItems count="${labels.length}">${labels.map((label) => `<s v="${xml(label)}"/>`).join("")}</groupItems></fieldGroup>`;
}
export function cacheGroupFingerprint(root: XmlNode): string {
  return JSON.stringify(
    nodes(child(root, "cacheFields").cacheField).map((field) => field.fieldGroup ?? null),
  );
}
export function nativeGroupFingerprint(
  groups: PivotFieldGroup[] | undefined,
  width: number,
  system: ExcelDateSystem,
): string {
  const fields = Array.from({ length: width }, (_, field) => {
    const group = groups?.find((group) => group.field === field);
    return group
      ? child(parseXml(strToU8(nativePivotGroupXml(group, system))), "fieldGroup")
      : null;
  });
  return JSON.stringify(fields);
}
export function readNativePivotGroups(root: XmlNode, system: ExcelDateSystem): PivotFieldGroup[] {
  return nodes(child(root, "cacheFields").cacheField).flatMap((field, index): PivotFieldGroup[] => {
    if (!("fieldGroup" in field)) return [];
    const group = child(field, "fieldGroup"),
      range = child(group, "rangePr");
    if (
      Number(attr(group, "base", "-1")) !== index ||
      !("rangePr" in group) ||
      "discretePr" in group ||
      attr(group, "par") !== ""
    )
      throw new Error("Unsupported nested or discrete pivot grouping.");
    const items = child(group, "groupItems");
    if (Object.keys(items).some((key) => !key.startsWith("@_") && key !== "s"))
      throw new Error("Unsupported pivot group labels.");
    const labels = nodes(items.s).map((item) => attr(item, "v"));
    if (labels.length < 3 || labels.length > 10000) throw new Error("Invalid pivot group labels.");
    const autoStart = ["1", "true"].includes(attr(range, "autoStart", "1"));
    const autoEnd = ["1", "true"].includes(attr(range, "autoEnd", "1"));
    const by = attr(range, "groupBy", "range");
    if (by === "range")
      return [
        {
          field: index,
          kind: "number" as const,
          start: Number(attr(range, "startNum")),
          end: Number(attr(range, "endNum")),
          interval: Number(attr(range, "groupInterval", "1")),
          labels,
          autoStart,
          autoEnd,
        },
      ];
    if (!["seconds", "minutes", "hours", "days", "months", "quarters", "years"].includes(by))
      throw new Error("Unsupported pivot date unit.");
    return [
      {
        field: index,
        kind: "date" as const,
        unit: by as PivotDateGroupUnit,
        start: readPivotCacheValue("d", attr(range, "startDate"), system) as number,
        end: readPivotCacheValue("d", attr(range, "endDate"), system) as number,
        interval: Number(attr(range, "groupInterval", "1")),
        labels,
        autoStart,
        autoEnd,
      },
    ];
  });
}
