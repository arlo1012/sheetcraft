import {
  PIVOT_AGGREGATES,
  PIVOT_DISPLAY_TYPES,
  type PivotAggregate,
  type PivotValueDisplay,
  type PivotValueField,
} from "@sheetcraft/core/pivot-tables";
import type { FormulaValue } from "@sheetcraft/core/formula";
import { attr, child, nodes, xml, type XmlNode } from "./pivot-xml.js";
import { pivotValueKey, primitivePivotValue } from "./pivot-cache.js";
export const DATA_FIELD_EXT = "{E15A36E0-9728-4E99-A89B-3F7291B0FE68}";
const extended = new Set([
  "percentOfParent",
  "percentOfParentRow",
  "percentOfParentCol",
  "percentOfRunningTotal",
  "rankAscending",
  "rankDescending",
]);
const nativeAggregate = (aggregate: PivotAggregate) =>
  aggregate === "stdev" ? "stdDev" : aggregate === "stdevp" ? "stdDevp" : aggregate;
export function nativeValueXml(
  value: PivotValueField,
  caption: string,
  numberFormat: number,
  shared: FormulaValue[][],
): string {
  const display = value.display;
  let baseItem = 0;
  if (display?.baseItem) {
    const item = display.baseItem;
    if (item.kind === "value") {
      const target = item.value;
      baseItem =
        shared[display.baseField!]?.findIndex((v) => pivotValueKey(v) === pivotValueKey(target)) ??
        -1;
    } else baseItem = item.kind === "previous" ? 1048828 : 1048829;
    if (baseItem < 0) throw new Error("Missing pivot base item.");
  }
  const type = display?.type ?? "normal";
  const extension = extended.has(type)
    ? `<extLst><ext uri="${DATA_FIELD_EXT}" xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main"><x14:dataField pivotShowAs="${type}"/></ext></extLst>`
    : "";
  return `<dataField name="${xml(caption)}" fld="${value.field}" subtotal="${nativeAggregate(value.aggregate)}" numFmtId="${numberFormat}" baseField="${display?.baseField ?? 0}" baseItem="${baseItem}"${!extended.has(type) && type !== "normal" ? ` showDataAs="${type}"` : ""}>${extension}</dataField>`;
}
export function readNativeValue(
  field: XmlNode,
  shared: FormulaValue[][],
): Pick<PivotValueField, "aggregate" | "display"> {
  const name = attr(field, "subtotal", "sum");
  const aggregate = name === "stdDev" ? "stdev" : name === "stdDevp" ? "stdevp" : name;
  if (!PIVOT_AGGREGATES.includes(aggregate as PivotAggregate) || aggregate === "distinctCount")
    throw new Error("Unsupported pivot aggregate.");
  const extension = nodes(child(field, "extLst").ext).find(
    (ext) => attr(ext, "uri").toUpperCase() === DATA_FIELD_EXT,
  );
  const type = extension
    ? attr(child(extension, "dataField"), "pivotShowAs", "normal")
    : attr(field, "showDataAs", "normal");
  if (!PIVOT_DISPLAY_TYPES.includes(type as PivotValueDisplay["type"]))
    throw new Error("Unsupported pivot value display.");
  if (type === "normal") return { aggregate: aggregate as PivotAggregate };
  const display: PivotValueDisplay = { type: type as PivotValueDisplay["type"] };
  if (
    [
      "percent",
      "difference",
      "percentDiff",
      "runTotal",
      "percentOfRunningTotal",
      "percentOfParent",
      "rankAscending",
      "rankDescending",
    ].includes(type)
  )
    display.baseField = Number(attr(field, "baseField", "-1"));
  if (["percent", "difference", "percentDiff"].includes(type)) {
    const index = Number(attr(field, "baseItem", "-1"));
    if (index === 1048828 || index === 1048829)
      display.baseItem = { kind: index === 1048828 ? "previous" : "next" };
    else {
      const item = shared[display.baseField!]?.[index];
      if (item === undefined) throw new Error("Invalid pivot base item.");
      display.baseItem = { kind: "value", value: primitivePivotValue(item) };
    }
  }
  return { aggregate: aggregate as PivotAggregate, display };
}
