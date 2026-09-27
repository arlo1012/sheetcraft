import { datePartsToExcelSerial } from "./formula/date-system.js";
import type { CellContent } from "./formula/types.js";
import { getMergedCellAnchor } from "./merged-cells.js";
import { cloneCellStyle, type CellNumberFormat, type CellStyle } from "./style.js";
import { validateDuplicateEntries } from "./duplicate-values.js";
import {
  createWorkbookEvaluator,
  cloneCellContent,
  getCellContent,
  getCellStyle,
  type CellAddress,
  type CellRange,
  type Workbook,
} from "./workbook.js";
import { assertFillDataValidation } from "./commands/fill-validation.js";
import { assertCellRange, invalidCommandPayload, normalizeRange } from "./commands/helpers.js";
import type { SetCellContentsCommand } from "./commands/contracts.js";
import { createBatchSetCellContentsCommand } from "./commands/values.js";

export type DataProofreadingKind = "number" | "date" | "time" | "percent" | "currency" | "identity";
export type DataProofreadingReason =
  | "textNumber"
  | "textDate"
  | "textTime"
  | "textPercent"
  | "textCurrency"
  | "identityText"
  | "unsafeLeadingZero"
  | "unsafePrecision"
  | "unsafeUnderflow"
  | "ambiguousDate"
  | "invalidDate"
  | "invalidTime";

export type DataProofreadingCellState = {
  content: CellContent | null;
  style: CellStyle | null;
};

/** A serializable, non-mutating proofreading result. Omitted proposals are advisory-only. */
export type DataProofreadingIssue = {
  sheetId: string;
  address: CellAddress;
  kind: DataProofreadingKind;
  reason: DataProofreadingReason;
  display: { current: string; proposed?: string };
  original: DataProofreadingCellState;
  proposed?: DataProofreadingCellState;
};

export type DataProofreadingScan = {
  scannedCount: number;
  issues: DataProofreadingIssue[];
};

const NUMBER_PATTERN = /^[+-]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const IDENTITY_PATTERN = /^\d{15}$|^\d{17}[\dXx]$/;
const LEADING_ZERO_PATTERN = /^[+-]?0(?=\d|,\d)/;
const YEAR_FIRST_DATE_PATTERN = /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/;
const AMBIGUOUS_DATE_PATTERN = /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/;
const TIME_PATTERN = /^\d{1,2}:\d{2}(?::\d{2})?$/;
const MAX_SCANNED_CELLS = 100_000;
const MAX_ISSUES = 10_000;

function sameAddress(left: CellAddress, right: CellAddress): boolean {
  return left.row === right.row && left.column === right.column;
}

function inRange(address: CellAddress, range: CellRange): boolean {
  return (
    address.row >= range.start.row &&
    address.row <= range.end.row &&
    address.column >= range.start.column &&
    address.column <= range.end.column
  );
}

function cloneContent(content: CellContent | null): CellContent | null {
  return content ? cloneCellContent(content) : null;
}

function cloneState(
  content: CellContent | null,
  style: CellStyle | undefined,
): DataProofreadingCellState {
  return { content: cloneContent(content), style: cloneCellStyle(style) ?? null };
}

function sameState(left: DataProofreadingCellState, right: DataProofreadingCellState): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function significantDigits(value: string): number {
  return value.replace(/^[+-]/, "").replace(/e.*$/i, "").replace(/[,.]/g, "").replace(/^0+/, "")
    .length;
}

function parseSafeNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!NUMBER_PATTERN.test(trimmed) || LEADING_ZERO_PATTERN.test(trimmed)) return;
  if (significantDigits(trimmed) > 15) return;
  const parsed = Number(trimmed.replaceAll(",", ""));
  if (!Number.isFinite(parsed)) return;
  // Do not turn an underflowing non-zero literal into zero.
  if (parsed === 0 && /[1-9]/.test(trimmed.replace(/e.*$/i, ""))) return;
  return parsed;
}

function withoutTextFormat(style: CellStyle | undefined): CellStyle | null {
  const next = cloneCellStyle(style);
  if (!next) return null;
  if (next.numberFormat?.kind === "text") delete next.numberFormat;
  return Object.keys(next).length ? next : null;
}

function withNumberFormat(style: CellStyle | undefined, numberFormat: CellNumberFormat): CellStyle {
  const next = cloneCellStyle(style);
  return next ? { ...next, numberFormat } : { numberFormat };
}

function countFractionDigits(value: string): number {
  const mantissa = value.replace(/^[+-]/, "").split(/[eE]/)[0] ?? "";
  const decimal = mantissa.split(".")[1] ?? "";
  return Math.min(decimal.length, 15);
}

function dateValue(value: string, workbook: Workbook): number | undefined {
  const match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(value.trim());
  if (!match) return;
  try {
    return datePartsToExcelSerial(
      {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0,
      },
      workbook.dateSystem,
    );
  } catch {
    return;
  }
}

function timeValue(value: string): { value: number; seconds: boolean } | undefined {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] === undefined ? 0 : Number(match[3]);
  if (hour > 23 || minute > 59 || second > 59) return;
  return { value: (hour * 3600 + minute * 60 + second) / 86_400, seconds: match[3] !== undefined };
}

function displayContent(content: CellContent): string {
  if (content.kind === "literal") return String(content.value ?? "");
  return content.kind;
}

function issue(
  sheetId: string,
  address: CellAddress,
  kind: DataProofreadingKind,
  reason: DataProofreadingReason,
  original: DataProofreadingCellState,
  proposed?: DataProofreadingCellState,
): DataProofreadingIssue {
  return {
    sheetId,
    address: { ...address },
    kind,
    reason,
    display: {
      current: original.content ? displayContent(original.content) : "",
      ...(proposed?.content ? { proposed: displayContent(proposed.content) } : {}),
    },
    original,
    ...(proposed ? { proposed } : {}),
  };
}

function scanLiteral(
  workbook: Workbook,
  sheetId: string,
  address: CellAddress,
  content: CellContent,
  style: CellStyle | undefined,
): DataProofreadingIssue | undefined {
  if (content.kind !== "literal" || typeof content.value !== "string") return;
  const original = cloneState(content, style);
  const text = content.value.trim();
  if (!text) return;
  if (IDENTITY_PATTERN.test(text))
    return issue(sheetId, address, "identity", "identityText", original);

  const date = dateValue(text, workbook);
  if (date !== undefined) {
    return issue(sheetId, address, "date", "textDate", original, {
      content: { kind: "literal", value: date },
      style: withNumberFormat(style, { kind: "date", code: "yyyy-mm-dd" }),
    });
  }
  if (YEAR_FIRST_DATE_PATTERN.test(text))
    return issue(sheetId, address, "date", "invalidDate", original);
  if (AMBIGUOUS_DATE_PATTERN.test(text))
    return issue(sheetId, address, "date", "ambiguousDate", original);
  const time = timeValue(text);
  if (time) {
    return issue(sheetId, address, "time", "textTime", original, {
      content: { kind: "literal", value: time.value },
      style: withNumberFormat(style, { kind: "time", code: time.seconds ? "hh:mm:ss" : "hh:mm" }),
    });
  }
  if (TIME_PATTERN.test(text)) return issue(sheetId, address, "time", "invalidTime", original);

  const percent = /^(.*)%$/.exec(text);
  if (percent) {
    const source = percent[1]?.trim() ?? "";
    const numeric = parseSafeNumber(source);
    if (numeric !== undefined) {
      if (numeric !== 0 && numeric / 100 === 0)
        return issue(sheetId, address, "percent", "unsafeUnderflow", original);
      return issue(sheetId, address, "percent", "textPercent", original, {
        content: { kind: "literal", value: numeric / 100 },
        style: withNumberFormat(style, {
          kind: "percent",
          fractionDigits: countFractionDigits(source),
        }),
      });
    }
    if (NUMBER_PATTERN.test(source) && LEADING_ZERO_PATTERN.test(source))
      return issue(sheetId, address, "percent", "unsafeLeadingZero", original);
    if (NUMBER_PATTERN.test(source) && significantDigits(source) > 15)
      return issue(sheetId, address, "percent", "unsafePrecision", original);
  }

  const currency = /^([￥¥$€£])\s*([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?|\.\d+)\s*$/.exec(text);
  if (currency) {
    const symbol = currency[1]!;
    const source = currency[2]!;
    const numeric = parseSafeNumber(source);
    if (numeric !== undefined) {
      const code = symbol === "$" ? "USD" : symbol === "€" ? "EUR" : symbol === "£" ? "GBP" : "CNY";
      return issue(sheetId, address, "currency", "textCurrency", original, {
        content: { kind: "literal", value: numeric },
        style: withNumberFormat(style, {
          kind: "currency",
          currency: code,
          currencySymbol: symbol,
          fractionDigits: countFractionDigits(source),
        }),
      });
    }
    if (LEADING_ZERO_PATTERN.test(source))
      return issue(sheetId, address, "currency", "unsafeLeadingZero", original);
    if (significantDigits(source) > 15)
      return issue(sheetId, address, "currency", "unsafePrecision", original);
  }

  if (NUMBER_PATTERN.test(text) && LEADING_ZERO_PATTERN.test(text))
    return issue(sheetId, address, "number", "unsafeLeadingZero", original);
  if (NUMBER_PATTERN.test(text) && significantDigits(text) > 15)
    return issue(sheetId, address, "number", "unsafePrecision", original);
  const numeric = parseSafeNumber(text);
  if (numeric === undefined) return;
  return issue(sheetId, address, "number", "textNumber", original, {
    content: { kind: "literal", value: numeric },
    style: withoutTextFormat(style),
  });
}

/** Scans only existing sparse cells and never mutates workbook state. */
export function scanDataProofreading(
  workbook: Workbook,
  sheetId: string,
  input: CellRange,
): DataProofreadingScan {
  const sheet = workbook.sheets.get(sheetId);
  if (!sheet) throw invalidCommandPayload("sheetId", sheetId);
  const range = normalizeRange(input);
  assertCellRange(range);
  const issues: DataProofreadingIssue[] = [];
  let scannedCount = 0;
  for (const [key, cell] of sheet.cells) {
    if (!cell.content || cell.content.kind !== "literal") continue;
    const [rowSource, columnSource] = key.split(":");
    const address = { row: Number(rowSource), column: Number(columnSource) };
    if (!inRange(address, range)) continue;
    const anchor = getMergedCellAnchor(sheet.mergedCells, address);
    if (anchor && !sameAddress(anchor, address)) continue;
    scannedCount += 1;
    if (scannedCount > MAX_SCANNED_CELLS)
      throw invalidCommandPayload(
        "range",
        input,
        `Data proofreading supports at most ${MAX_SCANNED_CELLS} populated cells.`,
      );
    const found = scanLiteral(workbook, sheetId, address, cell.content, cell.style);
    if (found) {
      issues.push(found);
      if (issues.length > MAX_ISSUES)
        throw invalidCommandPayload(
          "range",
          input,
          `Data proofreading supports at most ${MAX_ISSUES} issues per scan.`,
        );
    }
  }
  issues.sort(
    (left, right) =>
      left.address.row - right.address.row || left.address.column - right.address.column,
  );
  return { scannedCount, issues };
}

/** Builds one validated, atomic history command from selected safe scan proposals. */
export function createApplyDataProofreadingCommand(
  workbook: Workbook,
  sheetId: string,
  issues: readonly DataProofreadingIssue[],
): SetCellContentsCommand {
  const sheet = workbook.sheets.get(sheetId);
  if (!sheet) throw invalidCommandPayload("sheetId", sheetId);
  if (!issues.length)
    throw invalidCommandPayload("issues", issues, "No proofreading issues selected.");
  const seen = new Set<string>();
  const spillKeys = new Set(
    [...(createWorkbookEvaluator(workbook, sheetId).getSpillProjections?.() ?? [])].map(
      (entry) => `${entry.address.row}:${entry.address.column}`,
    ),
  );
  const changes = issues.map((entry, index) => {
    if (!entry || entry.sheetId !== sheetId || !entry.proposed)
      throw invalidCommandPayload(`issues.${index}`, entry);
    const key = `${entry.address.row}:${entry.address.column}`;
    if (seen.has(key)) throw invalidCommandPayload(`issues.${index}.address`, entry.address);
    seen.add(key);
    const anchor = getMergedCellAnchor(sheet.mergedCells, entry.address);
    if (anchor && !sameAddress(anchor, entry.address))
      throw invalidCommandPayload(
        `issues.${index}.address`,
        entry.address,
        "Cannot proofread a merged cell tail.",
      );
    if (spillKeys.has(key))
      throw invalidCommandPayload(
        `issues.${index}.address`,
        entry.address,
        "Cannot proofread a spill cell.",
      );
    const current = cloneState(
      getCellContent(sheet, entry.address),
      getCellStyle(sheet, entry.address),
    );
    if (!sameState(current, entry.original))
      throw invalidCommandPayload(
        `issues.${index}.original`,
        entry.original,
        "Cell changed since proofreading scan.",
      );
    const expected = current.content
      ? scanLiteral(workbook, sheetId, entry.address, current.content, current.style ?? undefined)
      : undefined;
    if (JSON.stringify(expected) !== JSON.stringify(entry))
      throw invalidCommandPayload(
        `issues.${index}`,
        entry,
        "Proofreading proposal is not valid for this cell.",
      );
    return {
      sheetId,
      address: { ...entry.address },
      content: cloneContent(entry.proposed.content),
      style: cloneCellStyle(entry.proposed.style ?? undefined) ?? null,
    };
  });
  const command = createBatchSetCellContentsCommand(changes);
  assertFillDataValidation(workbook, command);
  const duplicate = validateDuplicateEntries(workbook, command.changes);
  if (!duplicate.valid)
    throw invalidCommandPayload(
      "issues",
      issues,
      "Proofreading would violate duplicate-entry rules.",
    );
  return command;
}
