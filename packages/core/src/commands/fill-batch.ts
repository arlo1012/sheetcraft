import { datePartsToExcelSerial } from "../formula/date-system.js";
import type { CellContent } from "../formula/types.js";
import { formatCellNumberValue } from "../number-format.js";
import {
  cloneCellContent,
  getCellContent,
  getCellStyle,
  type CellAddress,
  type CellRange,
  type Workbook,
} from "../workbook.js";
import type { SetCellContentsCommand } from "./contracts.js";
import { DataFillError, prepareFillTarget } from "./fill-common.js";
import { createBatchSetCellContentsCommand } from "./values.js";

export type FillBlanksOptions = {
  mode: "up" | "down" | "left" | "right" | "value";
  value?: string | number | boolean;
};
export type InsertTextOptions = {
  position: "start" | "end" | "index";
  from: "left" | "right";
  index: number;
  text: string;
  locale?: string;
};
export type CurrentDateOptions = { year: number; month: number; day: number; format: string };

const addressKey = (address: CellAddress) => `${address.row}:${address.column}`;
const literal = (value: string | number | boolean): CellContent => ({ kind: "literal", value });
const isBlank = (content: CellContent | null) =>
  content === null || (content.kind === "literal" && content.value === "");

export function createFillBlanksCommand(
  workbook: Workbook,
  sheetId: string,
  input: CellRange,
  options: FillBlanksOptions,
): SetCellContentsCommand {
  const { sheet, range, evaluator } = prepareFillTarget(workbook, sheetId, input);
  if (!options || !["up", "down", "left", "right", "value"].includes(options.mode))
    throw new DataFillError("invalidOptions", "Choose a valid fill direction.");
  if (
    options.mode === "value" &&
    (!["string", "number", "boolean"].includes(typeof options.value) ||
      (typeof options.value === "number" && !Number.isFinite(options.value)))
  )
    throw new DataFillError("invalidOptions", "A fill value is required.");
  const captured = new Map<string, CellContent | null>();
  for (let row = range.start.row; row <= range.end.row; row += 1)
    for (let column = range.start.column; column <= range.end.column; column += 1)
      captured.set(`${row}:${column}`, getCellContent(sheet, { row, column }));
  const read = (address: CellAddress) =>
    captured.get(addressKey(address)) ?? getCellContent(sheet, address);
  const changes: SetCellContentsCommand["changes"] = [];
  const rowStep = options.mode === "up" ? -1 : options.mode === "down" ? 1 : 0;
  const columnStep = options.mode === "left" ? -1 : options.mode === "right" ? 1 : 0;
  const rows = Array.from({ length: range.end.row - range.start.row + 1 }, (_, index) =>
    options.mode === "down" ? range.end.row - index : range.start.row + index,
  );
  const columns = Array.from({ length: range.end.column - range.start.column + 1 }, (_, index) =>
    options.mode === "right" ? range.end.column - index : range.start.column + index,
  );
  for (const row of rows)
    for (const column of columns) {
      const address = { row, column };
      if (!isBlank(read(address))) continue;
      const sourceAddress = { row: row + rowStep, column: column + columnStep };
      const source = options.mode === "value" ? literal(options.value!) : read(sourceAddress);
      if (source === null || (source.kind === "literal" && source.value === "")) continue;
      // Directional blank fill copies the calculated scalar result, rather than
      // leaking a source formula or coercing false/0 to text.
      let content: CellContent;
      if (source.kind === "formula") {
        const calculated = evaluator.getComputedValue(sourceAddress);
        if (calculated === null || typeof calculated === "object") continue;
        content = literal(calculated);
      } else content = cloneCellContent(source);
      captured.set(addressKey(address), content);
      changes.push({ sheetId, address, content });
    }
  return createBatchSetCellContentsCommand(changes);
}

export function createInsertCellTextCommand(
  workbook: Workbook,
  sheetId: string,
  input: CellRange,
  options: InsertTextOptions,
): SetCellContentsCommand {
  const { sheet, range, evaluator } = prepareFillTarget(workbook, sheetId, input);
  if (
    !options ||
    !["start", "end", "index"].includes(options.position) ||
    !["left", "right"].includes(options.from) ||
    typeof options.text !== "string" ||
    !Number.isInteger(options.index) ||
    options.index < 0
  )
    throw new DataFillError("invalidOptions", "Text insertion options are invalid.");
  const changes: SetCellContentsCommand["changes"] = [];
  for (let row = range.start.row; row <= range.end.row; row += 1)
    for (let column = range.start.column; column <= range.end.column; column += 1) {
      const address = { row, column };
      const chars = Array.from(
        formatCellNumberValue(
          evaluator.getComputedValue(address),
          getCellStyle(sheet, address)?.numberFormat,
          {
            dateSystem: workbook.dateSystem,
            ...(options.locale ? { locale: options.locale } : {}),
          },
        ).text,
      );
      const offset = Math.min(options.index, chars.length);
      const insertion =
        options.position === "start"
          ? 0
          : options.position === "end"
            ? chars.length
            : options.from === "left"
              ? offset
              : chars.length - offset;
      changes.push({
        sheetId,
        address,
        content: literal(
          [...chars.slice(0, insertion), options.text, ...chars.slice(insertion)].join(""),
        ),
      });
    }
  return createBatchSetCellContentsCommand(changes);
}

export function createFillCurrentDateCommand(
  workbook: Workbook,
  sheetId: string,
  input: CellRange,
  options: CurrentDateOptions,
): SetCellContentsCommand {
  const { sheet, range } = prepareFillTarget(workbook, sheetId, input);
  if (
    !options ||
    !Number.isInteger(options.year) ||
    !Number.isInteger(options.month) ||
    !Number.isInteger(options.day) ||
    typeof options.format !== "string" ||
    !options.format
  )
    throw new DataFillError("invalidOptions", "Date options are invalid.");
  let serial: number;
  try {
    serial = datePartsToExcelSerial(
      {
        year: options.year,
        month: options.month,
        day: options.day,
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0,
      },
      workbook.dateSystem,
    );
  } catch {
    throw new DataFillError("invalidOptions", "The date is invalid.");
  }
  const changes: SetCellContentsCommand["changes"] = [];
  for (let row = range.start.row; row <= range.end.row; row += 1)
    for (let column = range.start.column; column <= range.end.column; column += 1) {
      const address = { row, column };
      changes.push({
        sheetId,
        address,
        content: literal(serial),
        style: {
          ...getCellStyle(sheet, address),
          numberFormat: { kind: "custom", code: options.format },
        },
      });
    }
  return createBatchSetCellContentsCommand(changes);
}
