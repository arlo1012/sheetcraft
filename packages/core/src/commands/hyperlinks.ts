import type { CellContent } from "../formula/types.js";
import { cloneCellStyle, normalizeCellStyle } from "../style.js";
import {
  cloneCellHyperlink,
  cloneCellNamedStyleBinding,
  getCell,
  getCellHyperlink,
  getCellNamedStyle,
  getCellStyle,
  normalizeCellHyperlink,
  setCellContent,
  setCellHyperlink,
  setCellNamedStyle,
  type CellAddress,
  type CellHyperlink,
  type Workbook,
} from "../workbook.js";
import type { MarkCellHyperlinkVisitedCommand, SetCellHyperlinkCommand } from "./contracts.js";
import { assertCellAddress, getSheetOrThrow, validateCommandPayload } from "./helpers.js";

function normalizeDisplayText(value: string): string {
  if (typeof value !== "string" || value.length > 32_767) {
    throw new TypeError("Hyperlink display text must be a string of at most 32767 characters.");
  }
  return value;
}

export function createSetCellHyperlinkCommand(
  sheetId: string,
  address: CellAddress,
  hyperlink: CellHyperlink | null,
  displayText?: string,
): SetCellHyperlinkCommand {
  assertCellAddress(address);
  return {
    type: "setCellHyperlink",
    sheetId,
    address: { ...address },
    hyperlink:
      validateCommandPayload("hyperlink", hyperlink, () => normalizeCellHyperlink(hyperlink)) ??
      null,
    ...(displayText === undefined ? {} : { displayText: normalizeDisplayText(displayText) }),
  };
}

export function createMarkCellHyperlinkVisitedCommand(
  sheetId: string,
  address: CellAddress,
  visited = true,
): MarkCellHyperlinkVisitedCommand {
  assertCellAddress(address);
  if (typeof visited !== "boolean")
    throw new TypeError("Hyperlink visited state must be a boolean.");
  return {
    type: "markCellHyperlinkVisited",
    sheetId,
    address: { ...address },
    ...(visited ? {} : { visited: false }),
  };
}

function applyHyperlinkAppearance(
  workbook: Workbook,
  sheetId: string,
  address: CellAddress,
  visited: boolean,
): void {
  const sheet = getSheetOrThrow(workbook, sheetId);
  const current = getCellStyle(sheet, address);
  const patch = {
    ...(current?.textColor === undefined || current.textColor === (visited ? "#0000ff" : "#800080")
      ? { textColor: visited ? "#800080" : "#0000ff" }
      : {}),
    ...(current?.underline === undefined ? { underline: true as const } : {}),
  };
  if (!Object.keys(patch).length) return;
  const binding = getCellNamedStyle(sheet, address);
  setCellNamedStyle(
    sheet,
    address,
    normalizeCellStyle({ ...current, ...patch }),
    binding
      ? {
          ...binding,
          overrides: [
            ...new Set([
              ...(binding.overrides ?? []),
              ...(Object.keys(patch) as Array<keyof import("../style.js").CellStyle>),
            ]),
          ],
        }
      : undefined,
  );
}

export function applySetCellHyperlinkCommand(
  workbook: Workbook,
  command: SetCellHyperlinkCommand,
): SetCellHyperlinkCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  assertCellAddress(command.address);
  if (command.restore) {
    const current = getCell(sheet, command.address);
    const redo: SetCellHyperlinkCommand = {
      type: "setCellHyperlink",
      sheetId: command.sheetId,
      address: { ...command.address },
      hyperlink: cloneCellHyperlink(getCellHyperlink(sheet, command.address)) ?? null,
      restore: {
        content: current?.content ? ({ ...current.content } as CellContent) : null,
        style: cloneCellStyle(getCellStyle(sheet, command.address)) ?? null,
        namedStyle: cloneCellNamedStyleBinding(getCellNamedStyle(sheet, command.address)) ?? null,
        hyperlink: cloneCellHyperlink(getCellHyperlink(sheet, command.address)) ?? null,
      },
    };
    setCellContent(sheet, command.address, command.restore.content);
    setCellNamedStyle(sheet, command.address, command.restore.style, command.restore.namedStyle);
    setCellHyperlink(sheet, command.address, command.restore.hyperlink);
    return redo;
  }
  const current = getCell(sheet, command.address);
  const inverse: SetCellHyperlinkCommand = {
    type: "setCellHyperlink",
    sheetId: command.sheetId,
    address: { ...command.address },
    hyperlink: cloneCellHyperlink(getCellHyperlink(sheet, command.address)) ?? null,
    restore: {
      content: current?.content ? ({ ...current.content } as CellContent) : null,
      style: cloneCellStyle(getCellStyle(sheet, command.address)) ?? null,
      namedStyle: cloneCellNamedStyleBinding(getCellNamedStyle(sheet, command.address)) ?? null,
      hyperlink: cloneCellHyperlink(getCellHyperlink(sheet, command.address)) ?? null,
    },
  };
  const hyperlink = normalizeCellHyperlink(command.hyperlink);
  if (command.displayText !== undefined) {
    setCellContent(sheet, command.address, {
      kind: "literal",
      value: normalizeDisplayText(command.displayText),
    });
  }
  setCellHyperlink(sheet, command.address, hyperlink);
  if (hyperlink)
    applyHyperlinkAppearance(
      workbook,
      command.sheetId,
      command.address,
      Boolean(hyperlink.visited),
    );
  return inverse;
}

export function applyMarkCellHyperlinkVisitedCommand(
  workbook: Workbook,
  command: MarkCellHyperlinkVisitedCommand,
): MarkCellHyperlinkVisitedCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  assertCellAddress(command.address);
  const current = getCellHyperlink(sheet, command.address);
  if (!current) return null;
  const visited = command.visited ?? true;
  if (Boolean(current.visited) === visited) return null;
  setCellHyperlink(sheet, command.address, { ...current, visited });
  applyHyperlinkAppearance(workbook, command.sheetId, command.address, visited);
  return createMarkCellHyperlinkVisitedCommand(command.sheetId, command.address, !visited);
}
