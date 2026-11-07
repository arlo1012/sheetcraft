import {
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  type CellAddress,
  type CellRange,
  type CellValue,
  type SheetEvaluator,
} from "./workbook.js";
export type FormControlType =
  | "checkbox"
  | "radio"
  | "combo"
  | "list"
  | "spinner"
  | "scrollbar"
  | "button"
  | "label"
  | "group";
export type SheetFormControl = {
  type: FormControlType;
  label: string;
  linkedCell: CellAddress | null;
  localValue?: number | boolean;
  source: CellRange | null;
  items: string[];
  min: number;
  max: number;
  step: number;
  optionValue: number;
  resetValue: CellValue;
};
const types = new Set([
  "checkbox",
  "radio",
  "combo",
  "list",
  "spinner",
  "scrollbar",
  "button",
  "label",
  "group",
]);
const address = (a: CellAddress) =>
  a &&
  Number.isInteger(a.row) &&
  Number.isInteger(a.column) &&
  a.row >= 0 &&
  a.row < MAX_SHEET_ROWS &&
  a.column >= 0 &&
  a.column < MAX_SHEET_COLUMNS;
export function normalizeFormControl(value: SheetFormControl): SheetFormControl {
  if (
    !value ||
    !types.has(value.type) ||
    typeof value.label !== "string" ||
    value.label.length > 1000 ||
    (value.linkedCell !== null && !address(value.linkedCell)) ||
    !Array.isArray(value.items) ||
    value.items.length > 1000 ||
    value.items.some((item) => typeof item !== "string" || item.length > 1000) ||
    [value.min, value.max, value.step, value.optionValue].some(
      (n) => typeof n !== "number" || !Number.isFinite(n),
    ) ||
    value.min > value.max ||
    value.step <= 0 ||
    (value.resetValue !== null &&
      typeof value.resetValue !== "string" &&
      typeof value.resetValue !== "number" &&
      typeof value.resetValue !== "boolean") ||
    (typeof value.resetValue === "number" && !Number.isFinite(value.resetValue)) ||
    (typeof value.resetValue === "string" && value.resetValue.length > 1000)
  )
    throw new RangeError("Invalid form control.");
  const source = value.source;
  if (
    source !== null &&
    (!source ||
      !address(source.start) ||
      !address(source.end) ||
      source.start.row > source.end.row ||
      source.start.column > source.end.column ||
      (source.start.row !== source.end.row && source.start.column !== source.end.column) ||
      (source.end.row - source.start.row + 1) * (source.end.column - source.start.column + 1) >
        1000)
  )
    throw new RangeError("Control items require a single row or column of at most 1,000 cells.");
  if (
    value.localValue !== undefined &&
    typeof value.localValue !== "boolean" &&
    (typeof value.localValue !== "number" || !Number.isFinite(value.localValue))
  )
    throw new RangeError("Invalid form control value.");
  const localValue = value.linkedCell
    ? undefined
    : normalizeLocalControlValue(value, value.localValue);
  return {
    type: value.type,
    label: value.label,
    linkedCell: value.linkedCell ? { ...value.linkedCell } : null,
    ...(localValue === undefined ? {} : { localValue }),
    source: source ? { start: { ...source.start }, end: { ...source.end } } : null,
    items: [...value.items],
    min: value.min,
    max: value.max,
    step: value.step,
    optionValue: value.optionValue,
    resetValue: value.resetValue,
  };
}
/** Keep only a standalone value the configured control can display. */
export function normalizeLocalControlValue(
  control: SheetFormControl,
  value: unknown,
): number | boolean | undefined {
  if (control.type === "checkbox") return typeof value === "boolean" ? value : undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  switch (control.type) {
    case "radio":
      return value === control.optionValue ? value : undefined;
    case "combo":
    case "list": {
      const { source } = control;
      const count = source
        ? Math.max(source.end.row - source.start.row, source.end.column - source.start.column) + 1
        : control.items.length;
      return Number.isInteger(value) && value >= 1 && value <= count ? value : undefined;
    }
    case "spinner":
    case "scrollbar":
      return Math.min(control.max, Math.max(control.min, value));
    default:
      return undefined;
  }
}
export function getFormControlValue(control: SheetFormControl, evaluator: SheetEvaluator) {
  return control.linkedCell
    ? evaluator.getComputedValue(control.linkedCell)
    : (control.localValue ?? null);
}
export function getFormControlItems(
  control: SheetFormControl,
  evaluator: SheetEvaluator,
): string[] {
  if (!control.source) return [...control.items];
  const values: string[] = [];
  for (let row = control.source.start.row; row <= control.source.end.row; row++)
    for (let column = control.source.start.column; column <= control.source.end.column; column++) {
      const value = evaluator.getComputedValue({ row, column });
      values.push(value === null || typeof value === "object" ? "" : String(value));
    }
  return values;
}
export function resolveFormControlValue(
  control: SheetFormControl,
  requested: unknown,
  itemCount: number,
): CellValue | undefined {
  switch (control.type) {
    case "checkbox":
      return typeof requested === "boolean" ? requested : undefined;
    case "radio":
      return control.optionValue;
    case "button":
      return control.resetValue;
    case "combo":
    case "list":
      return typeof requested === "number" &&
        Number.isInteger(requested) &&
        requested >= 1 &&
        requested <= itemCount
        ? requested
        : undefined;
    case "spinner":
    case "scrollbar":
      return typeof requested === "number" &&
        Number.isFinite(requested) &&
        requested >= control.min &&
        requested <= control.max
        ? Math.min(
            control.max,
            Math.max(
              control.min,
              control.min + Math.round((requested - control.min) / control.step) * control.step,
            ),
          )
        : undefined;
    default:
      return undefined;
  }
}
