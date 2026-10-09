import type {
  PivotLabelCondition,
  PivotValueCondition,
  SheetPivotTable,
} from "@sheetcraft/core/pivot-tables";
import type { CompatibilityReportBuilder } from "./report.js";
import { attr, child, flag, nodes, xml, type XmlNode } from "./pivot-xml.js";

const captions: Record<string, string> = {
  equals: "captionEqual",
  notEquals: "captionNotEqual",
  beginsWith: "captionBeginsWith",
  doesNotBeginWith: "captionNotBeginsWith",
  endsWith: "captionEndsWith",
  doesNotEndWith: "captionNotEndsWith",
  contains: "captionContains",
  doesNotContain: "captionNotContains",
  greaterThan: "captionGreaterThan",
  greaterThanOrEqual: "captionGreaterThanOrEqual",
  lessThan: "captionLessThan",
  lessThanOrEqual: "captionLessThanOrEqual",
  between: "captionBetween",
  notBetween: "captionNotBetween",
};
const values: Record<string, string> = {
  equals: "valueEqual",
  notEquals: "valueNotEqual",
  greaterThan: "valueGreaterThan",
  greaterThanOrEqual: "valueGreaterThanOrEqual",
  lessThan: "valueLessThan",
  lessThanOrEqual: "valueLessThanOrEqual",
  between: "valueBetween",
  notBetween: "valueNotBetween",
};
const customOperator: Record<string, string> = {
  equals: "equal",
  notEquals: "notEqual",
  greaterThan: "greaterThan",
  greaterThanOrEqual: "greaterThanOrEqual",
  lessThan: "lessThan",
  lessThanOrEqual: "lessThanOrEqual",
};
function customXml(
  condition: Extract<
    PivotValueCondition | PivotLabelCondition,
    { kind: "text" | "number" | "date" }
  >,
): string {
  let value = condition.value;
  let operator = customOperator[condition.operator] ?? "equal";
  if (condition.operator.includes("BeginWith") || condition.operator === "beginsWith")
    value = `${value}*`;
  if (condition.operator.includes("EndWith") || condition.operator === "endsWith")
    value = `*${value}`;
  if (condition.operator === "contains" || condition.operator === "doesNotContain")
    value = `*${value}*`;
  if (condition.operator.startsWith("doesNot")) operator = "notEqual";
  if (condition.operator === "between" || condition.operator === "notBetween") {
    const inverse = condition.operator === "notBetween";
    return `<customFilters and="${inverse ? 0 : 1}"><customFilter operator="${inverse ? "lessThan" : "greaterThanOrEqual"}" val="${xml(condition.value)}"/><customFilter operator="${inverse ? "greaterThan" : "lessThanOrEqual"}" val="${xml(condition.value2)}"/></customFilters>`;
  }
  return `<customFilters><customFilter operator="${operator}" val="${xml(value)}"/></customFilters>`;
}
export function nativePivotFiltersXml(
  table: SheetPivotTable,
  report?: CompatibilityReportBuilder,
): string {
  const filters: string[] = [];
  for (const rule of table.axisFilters ?? []) {
    const add = (condition: PivotLabelCondition | PivotValueCondition, measure?: number) => {
      const base = `fld="${rule.field}" id="${filters.length}"${measure === undefined ? "" : ` iMeasureFld="${measure}"`}`;
      let content: string;
      let type: string;
      let strings = "";
      if (condition.kind === "rank" && measure !== undefined) {
        const mode = condition.mode ?? (condition.percent ? "percent" : "items");
        type = mode === "items" ? "count" : mode;
        content = `<top10 top="${condition.bottom ? 0 : 1}" percent="${mode === "percent" ? 1 : 0}" val="${condition.count}"/>`;
      } else if (
        condition.kind === "text" ||
        (condition.kind === "number" && measure !== undefined)
      ) {
        type = (measure === undefined ? captions : values)[condition.operator]!;
        content = customXml(condition);
        if (measure === undefined)
          strings = ` stringValue1="${xml(condition.value)}"${condition.value2 === undefined ? "" : ` stringValue2="${xml(condition.value2)}"`}`;
      } else {
        report?.add("filter-omitted", "warning", `${table.name}.nativeCondition`);
        return;
      }
      filters.push(
        `<filter ${base} type="${type}"${strings}><autoFilter ref="A1"><filterColumn colId="0">${content}</filterColumn></autoFilter></filter>`,
      );
    };
    if (rule.labelCondition) add(rule.labelCondition);
    if (rule.valueCondition) add(rule.valueCondition.condition, rule.valueCondition.measure);
  }
  return filters.length ? `<filters count="${filters.length}">${filters.join("")}</filters>` : "";
}
export function readNativePivotFilters(root: XmlNode, table: SheetPivotTable): void {
  for (const filter of nodes(child(root, "filters").filter)) {
    const field = Number(attr(filter, "fld", "-1"));
    const axis = table.rowFields.includes(field)
      ? "rows"
      : table.columnFields.includes(field)
        ? "columns"
        : undefined;
    if (!axis) throw new Error("Unsupported pivot filter field.");
    const rules = (table.axisFilters ??= []);
    let rule = rules.find((entry) => entry.axis === axis && entry.field === field);
    if (!rule) {
      rule = { axis, field };
      rules.push(rule);
    }
    const type = attr(filter, "type");
    const column = nodes(child(child(filter, "autoFilter"), "filterColumn").customFilters);
    const customs = nodes((column[0] ?? {}).customFilter);
    const measure = Number(attr(filter, "iMeasureFld", "-1"));
    const numeric = (index: number) => {
      const value = Number(attr(customs[index] ?? {}, "val", "NaN"));
      if (!Number.isFinite(value)) throw new Error("Invalid pivot filter operand.");
      return value;
    };
    const captionOp = Object.entries(captions).find(([, name]) => name === type)?.[0];
    const valueOp = Object.entries(values).find(([, name]) => name === type)?.[0];
    if (captionOp)
      rule.labelCondition = {
        kind: "text",
        operator: captionOp,
        value: attr(filter, "stringValue1"),
        ...(type.endsWith("Between") ? { value2: attr(filter, "stringValue2") } : {}),
      } as PivotLabelCondition;
    else if (valueOp && measure >= 0)
      rule.valueCondition = {
        measure,
        condition: {
          kind: "number",
          operator: valueOp,
          value: numeric(0),
          ...(type.endsWith("Between") ? { value2: numeric(1) } : {}),
        } as PivotValueCondition,
      };
    else if (["count", "percent", "sum"].includes(type) && measure >= 0) {
      const top = child(nodes(child(filter, "autoFilter").filterColumn)[0] ?? {}, "top10");
      rule.valueCondition = {
        measure,
        condition: {
          kind: "rank",
          bottom: !flag(top, "top", true),
          percent: type === "percent",
          count: Number(attr(top, "val")),
          mode: type === "count" ? "items" : (type as "percent" | "sum"),
        },
      };
    } else throw new Error("Unsupported pivot filter.");
  }
}

/** Extra product rules keep their cached result until the user explicitly refreshes externally. */
export function canRefreshNativePivotOnLoad(table: SheetPivotTable): boolean {
  return (
    table.includeHidden &&
    (table.axisFilters ?? []).every(
      (rule) =>
        (!rule.labelCondition || rule.labelCondition.kind === "text") &&
        (!rule.valueCondition ||
          rule.valueCondition.condition.kind === "number" ||
          rule.valueCondition.condition.kind === "rank"),
    )
  );
}
