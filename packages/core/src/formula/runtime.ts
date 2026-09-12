import {
  createFormulaError,
  isFormulaError,
  type FormulaArray,
  type FormulaRuntimeValue,
  type FormulaValue,
} from "./types.js";

export function formulaArray(rows: readonly (readonly FormulaValue[])[]): FormulaArray {
  const width = rows[0]?.length ?? 0;
  if (!rows.length || !width || rows.some((row) => row.length !== width))
    return { kind: "formula-array", rows: [[createFormulaError("CALC")]] };
  return { kind: "formula-array", rows };
}

export function isFormulaArray(value: FormulaRuntimeValue): value is FormulaArray {
  return (
    typeof value === "object" && value !== null && "kind" in value && value.kind === "formula-array"
  );
}

export function scalarize(value: FormulaRuntimeValue): FormulaValue {
  return isFormulaArray(value) ? (value.rows[0]?.[0] ?? createFormulaError("CALC")) : value;
}

export function runtimeRows(value: FormulaRuntimeValue): readonly (readonly FormulaValue[])[] {
  return isFormulaArray(value) ? value.rows : [[value]];
}

export function runtimeError(value: FormulaRuntimeValue): FormulaValue | null {
  if (isFormulaArray(value)) {
    for (const row of value.rows) for (const item of row) if (isFormulaError(item)) return item;
    return null;
  }
  return isFormulaError(value) ? value : null;
}
