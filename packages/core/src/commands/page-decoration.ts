import {
  cloneSheetPageDecoration,
  normalizeSheetPageDecoration,
  cloneWatermarkPresets,
  normalizeWatermarkPresets,
  type SheetPageDecoration,
  type SheetWatermark,
  type WatermarkPreset,
} from "../page-decoration.js";
import type { Workbook } from "../workbook.js";
import type {
  SetSheetPageDecorationCommand,
  SetSheetsWatermarkCommand,
  SetWorkbookWatermarkPresetsCommand,
} from "./contracts.js";
import { getSheetOrThrow, validateCommandPayload } from "./helpers.js";

export function createSetSheetPageDecorationCommand(
  sheetId: string,
  decoration: SheetPageDecoration,
): SetSheetPageDecorationCommand {
  return {
    type: "setSheetPageDecoration",
    sheetId,
    decoration: validateCommandPayload("decoration", decoration, () =>
      normalizeSheetPageDecoration(decoration),
    ),
  };
}

export function applySetSheetPageDecorationCommand(
  workbook: Workbook,
  command: SetSheetPageDecorationCommand,
): SetSheetPageDecorationCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const decoration = validateCommandPayload("decoration", command.decoration, () =>
    normalizeSheetPageDecoration(command.decoration),
  );
  const previous = cloneSheetPageDecoration(sheet.pageDecoration);
  if (JSON.stringify(previous) === JSON.stringify(decoration)) return null;
  sheet.pageDecoration = cloneSheetPageDecoration(decoration);
  return createSetSheetPageDecorationCommand(command.sheetId, previous);
}

function normalizeSheetIds(sheetIds: readonly string[]): string[] {
  if (!Array.isArray(sheetIds) || sheetIds.length === 0)
    throw new TypeError("At least one sheet ID is required.");
  const ids = sheetIds.map((sheetId) => {
    if (typeof sheetId !== "string" || !sheetId.trim()) throw new TypeError("Sheet ID is invalid.");
    return sheetId;
  });
  if (new Set(ids).size !== ids.length) throw new TypeError("Sheet IDs must be unique.");
  return ids;
}

function normalizeWatermark(watermark: SheetWatermark | undefined): SheetWatermark | undefined {
  return normalizeSheetPageDecoration(watermark ? { watermark } : {}).watermark;
}

export function createSetSheetsWatermarkCommand(
  sheetIds: string[],
  watermark: SheetWatermark | undefined,
  presets?: readonly WatermarkPreset[],
): SetSheetsWatermarkCommand {
  const ids = validateCommandPayload("sheetIds", sheetIds, () => normalizeSheetIds(sheetIds));
  return {
    type: "setSheetsWatermark",
    sheetIds: ids,
    ...(watermark
      ? {
          watermark: validateCommandPayload("watermark", watermark, () =>
            normalizeWatermark(watermark)!,
          ),
        }
      : {}),
    ...(presets === undefined
      ? {}
      : {
          watermarkPresets: validateCommandPayload("watermarkPresets", presets, () =>
            normalizeWatermarkPresets(presets),
          ),
        }),
  };
}

export function createSetWorkbookWatermarkPresetsCommand(
  presets: readonly WatermarkPreset[],
): SetWorkbookWatermarkPresetsCommand {
  return {
    type: "setWorkbookWatermarkPresets",
    presets: validateCommandPayload("watermarkPresets", presets, () =>
      normalizeWatermarkPresets(presets),
    ),
  };
}

export function applySetWorkbookWatermarkPresetsCommand(
  workbook: Workbook,
  command: SetWorkbookWatermarkPresetsCommand,
): SetWorkbookWatermarkPresetsCommand | null {
  const presets = validateCommandPayload("watermarkPresets", command.presets, () =>
    normalizeWatermarkPresets(command.presets),
  );
  const previous = cloneWatermarkPresets(workbook.watermarkPresets);
  if (JSON.stringify(previous) === JSON.stringify(presets)) return null;
  workbook.watermarkPresets = cloneWatermarkPresets(presets);
  return createSetWorkbookWatermarkPresetsCommand(previous);
}

export function applySetSheetsWatermarkCommand(
  workbook: Workbook,
  command: SetSheetsWatermarkCommand,
): SetSheetsWatermarkCommand | null {
  const sheetIds = validateCommandPayload("sheetIds", command.sheetIds, () =>
    normalizeSheetIds(command.sheetIds),
  );
  const restoreEntries = command.watermarks;
  if (restoreEntries !== undefined && command.watermark !== undefined)
    throw new TypeError("Watermark command cannot set both watermark and inverse values.");
  const watermark =
    restoreEntries === undefined
      ? validateCommandPayload("watermark", command.watermark, () =>
          normalizeWatermark(command.watermark),
        )
      : undefined;
  const restoreBySheetId = new Map(
    (restoreEntries ?? []).map((entry) => [entry.sheetId, normalizeWatermark(entry.watermark)]),
  );
  if (
    restoreEntries &&
    (restoreBySheetId.size !== sheetIds.length || restoreEntries.length !== sheetIds.length)
  )
    throw new TypeError("Watermark inverse must include every target sheet exactly once.");
  if (restoreEntries && sheetIds.some((sheetId) => !restoreBySheetId.has(sheetId)))
    throw new TypeError("Watermark inverse contains an unexpected sheet.");

  const nextPresets =
    command.watermarkPresets === undefined
      ? undefined
      : validateCommandPayload("watermarkPresets", command.watermarkPresets, () =>
          normalizeWatermarkPresets(command.watermarkPresets),
        );

  // Resolve every target before changing one, so unknown IDs cannot cause partial edits.
  const sheets = sheetIds.map((sheetId) => getSheetOrThrow(workbook, sheetId));
  const previous = sheets.map((sheet) => ({
    sheetId: sheet.id,
    watermark: cloneSheetPageDecoration(sheet.pageDecoration).watermark,
  }));
  const next = sheets.map((sheet) => {
    const decoration = cloneSheetPageDecoration(sheet.pageDecoration);
    const nextWatermark = restoreEntries === undefined ? watermark : restoreBySheetId.get(sheet.id);
    return cloneSheetPageDecoration({
      ...(decoration.backgroundAssetId ? { backgroundAssetId: decoration.backgroundAssetId } : {}),
      ...(nextWatermark ? { watermark: nextWatermark } : {}),
    });
  });
  const previousPresets = cloneWatermarkPresets(workbook.watermarkPresets);
  if (
    next.every(
      (decoration, index) =>
        JSON.stringify(decoration) ===
        JSON.stringify(cloneSheetPageDecoration(sheets[index]!.pageDecoration)),
    ) &&
    (nextPresets === undefined || JSON.stringify(previousPresets) === JSON.stringify(nextPresets))
  )
    return null;
  sheets.forEach((sheet, index) => {
    sheet.pageDecoration = next[index]!;
  });
  if (nextPresets !== undefined) workbook.watermarkPresets = cloneWatermarkPresets(nextPresets);
  return {
    type: "setSheetsWatermark",
    sheetIds,
    watermarks: previous,
    ...(nextPresets === undefined ? {} : { watermarkPresets: previousPresets }),
  };
}
