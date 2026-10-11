import { vi } from "vitest";
import { createSetSheetFloatingImagesCommand } from "@sheetcraft/core/commands";
import { createWorkbookSession, executeWorkbookCommand } from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { isPictureGroup, type PictureGroupPath } from "@sheetcraft/core/picture-group";
import { resolvePictureGroup } from "@sheetcraft/core/picture-group-layout";
import { isFramedPictureObject, type PictureObject } from "@sheetcraft/core/picture-object";
import { resolvePictureFrame } from "@sheetcraft/core/picture-frame";
import {
  getActiveSheet,
  getDefaultColumnWidth,
  DEFAULT_ROW_HEIGHT,
  type Sheet,
} from "@sheetcraft/core/workbook";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import {
  createPictureViewMetrics,
  type PictureFrameLayoutContext,
} from "@sheetcraft/sheet-engine/picture-frame-layout";
import type {
  GridClipboardPort,
  GridClipboardTransfer,
} from "../../../../modules/sheet-grid/gridClipboardPort";
import { useOwnedPictureClipboard } from "../../../../modules/sheet-images/useOwnedPictureClipboard";
import { framedPicture } from "../framed-picture-fixture";
import { legacyPicture, nestedGroup } from "../owned-picture-clipboard/fixture";

export function context(
  sheet: Sheet,
  effectiveRows = sheet.rowHeights,
  bodyScrollPosition = { x: 150, y: 90 },
): PictureFrameLayoutContext {
  const geometry = createSheetGeometry({
    rowCount: 100,
    columnCount: 100,
    rowHeight: DEFAULT_ROW_HEIGHT,
    columnWidth: getDefaultColumnWidth(sheet),
    rowHeights: effectiveRows,
    columnWidths: sheet.columnWidths,
    hiddenColumns: sheet.hiddenColumns,
  });
  const rows = createRowVisibilityIndex({
    rowCount: 100,
    defaultRowHeight: DEFAULT_ROW_HEIGHT,
    rowHeights: effectiveRows,
    hiddenRows: sheet.hiddenRows,
  });
  return {
    layout: createSheetViewportLayout({
      geometry,
      rows,
      freeze: { rows: 2, columns: 2 },
      bodyScrollPosition,
      viewportSize: { width: 600, height: 400 },
    }),
    metrics: createPictureViewMetrics(sheet, geometry, rows, {
      effectiveRowHeights: effectiveRows,
    }),
  };
}

export function fixture(port?: Partial<GridClipboardPort>) {
  const session = createWorkbookSession({ idFactory: createSequentialIdFactory() });
  const sheet = getActiveSheet(session.workbook);
  sheet.floatingImages = [framedPicture(), nestedGroup(), legacyPicture()];
  let currentSheet = sheet;
  let ownerGeneration = 3;
  let frameContext: PictureFrameLayoutContext | undefined = context(
    sheet,
    new Map([
      [0, 51],
      [1, 39],
    ]),
  );
  let selectedPaths: readonly PictureGroupPath[] | undefined;
  const write = vi.fn(async (_transfer: { text: string; localToken: string }) => ({
    localTokenWritten: true,
  }));
  const nativeWrite = vi.fn(async (_transfer: { text: string; localToken: string }) => {});
  const read = vi.fn(async (): Promise<GridClipboardTransfer> => ({}));
  const onCopy = vi.fn();
  const onFeedback = vi.fn();
  const execute = vi.fn((forest: readonly PictureObject[]) =>
    executeWorkbookCommand(session, createSetSheetFloatingImagesCommand(currentSheet.id, forest)),
  );
  const clipboard = useOwnedPictureClipboard({
    getSheet: () => currentSheet,
    getRevision: () => session.history.revision,
    getOwnerGeneration: () => ownerGeneration,
    getFrameContext: () => frameContext,
    getSelectedPaths: () => selectedPaths,
    clipboardPort: { write, read, writeNativeRich: nativeWrite, ...port },
    execute,
    onCopy,
    onFeedback,
  });
  return {
    clipboard,
    session,
    sheet,
    write,
    nativeWrite,
    execute,
    onCopy,
    onFeedback,
    transfer: (): GridClipboardTransfer => ({
      text: write.mock.calls.at(-1)?.[0]?.text,
      localToken: clipboard.getIdentity()?.token,
    }),
    getContext: () => frameContext!,
    setContext: (next: PictureFrameLayoutContext | undefined) => {
      frameContext = next;
    },
    setSheet: (next: Sheet) => {
      currentSheet = next;
    },
    setGeneration: (next: number) => {
      ownerGeneration = next;
    },
    setSelection: (next: readonly PictureGroupPath[] | undefined) => {
      selectedPaths = next;
    },
  };
}
export function rect(root: PictureObject, frameContext: PictureFrameLayoutContext) {
  if (isPictureGroup(root)) return resolvePictureGroup(root, frameContext.metrics).layout.rect;
  if (isFramedPictureObject(root))
    return resolvePictureFrame(root.frame, frameContext.metrics).rect;
  return {
    x: frameContext.metrics.columns.visiblePrefix(root.anchor.column) + root.offsetX,
    y: frameContext.metrics.rows.visiblePrefix(root.anchor.row) + root.offsetY,
    width: root.width,
    height: root.height,
  };
}
export function event() {
  const data = new Map<string, string>();
  const value = new Event("copy", { cancelable: true }) as ClipboardEvent;
  Object.defineProperty(value, "clipboardData", {
    value: { setData: (type: string, text: string) => data.set(type, text) },
  });
  return { event: value, data };
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, refuse) => {
    resolve = accept;
    reject = refuse;
  });
  return { promise, resolve, reject };
}
