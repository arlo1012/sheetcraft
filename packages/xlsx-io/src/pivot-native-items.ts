import {
  getPivotPresentation,
  type PivotResult,
  type SheetPivotTable,
} from "@sheetcraft/core/pivot-tables";
import { pivotValueKey, type PivotCache } from "./pivot-cache.js";

/** Producer-verified leaf axes: indices address pivotField.items, not visible row numbers. */
export function nativePivotAxisItems(
  table: SheetPivotTable,
  cache: PivotCache,
  result: PivotResult,
) {
  const presentation = getPivotPresentation(table);
  if (
    table.rowFields.length !== 1 ||
    table.columnFields.length !== 1 ||
    table.values.length !== 1 ||
    table.groups?.length ||
    table.consolidation ||
    presentation.blankRows ||
    presentation.subtotals !== "off"
  )
    return { rowItems: "", colItems: "" };
  const rowField = table.rowFields[0]!;
  const columnField = table.columnFields[0]!;
  const rowIndices = result.dataRows.map((row) => {
    const values = result.rowMembers[row];
    return values?.length === 1
      ? cache.shared[rowField]!.findIndex(
          (value) => pivotValueKey(value) === pivotValueKey(values[0]!),
        )
      : -1;
  });
  const totalColumn =
    result.totalColumnStart === null ? -1 : result.totalColumnStart - result.rowLabelColumns;
  const columnIndices = result.columnMembers
    .filter((_, index) => index !== totalColumn)
    .map((members) =>
      members.length === 1
        ? cache.shared[columnField]!.findIndex(
            (value) => pivotValueKey(value) === pivotValueKey(members[0]!),
          )
        : -1,
    );
  if (
    !rowIndices.length ||
    !columnIndices.length ||
    rowIndices.includes(-1) ||
    columnIndices.includes(-1)
  )
    return { rowItems: "", colItems: "" };
  const items = (tag: string, indices: number[], total: boolean) =>
    `<${tag} count="${indices.length + Number(total)}">${indices
      .map((index) => `<i><x v="${index}"/></i>`)
      .join("")}${total ? '<i t="grand"><x v="0"/></i>' : ""}</${tag}>`;
  return {
    rowItems: items("rowItems", rowIndices, result.totalRow !== null),
    colItems: items("colItems", columnIndices, result.totalColumnStart !== null),
  };
}
