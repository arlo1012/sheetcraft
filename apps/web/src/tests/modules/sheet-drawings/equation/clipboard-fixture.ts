import { vi } from "vitest";
import { effectScope } from "vue";
import {
  serializeEquationDocument,
  type EquationDocument,
} from "@sheetcraft/core/equation-document";
import { createWorkbookSession, executeWorkbookCommand } from "@sheetcraft/core/history";
import {
  createPictureSheetMetrics,
  type PictureSheetMetrics,
} from "@sheetcraft/core/picture-axis-metrics";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { normalizeShapeDrawingForest } from "@sheetcraft/core/shape-group-planning";
import type { ShapeGroupPath } from "@sheetcraft/core/shape-group";
import type { SheetDrawing, SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  createWorkbook,
  createSheet,
  getActiveSheet,
  type CellAddress,
  type Sheet,
} from "@sheetcraft/core/workbook";
import { createGraphicDrawing } from "../../../../modules/sheet-drawings/drawing-defaults";
import { useDrawingActions } from "../../../../modules/sheet-drawings/useDrawingActions";
import { useShapeClipboard } from "../../../../modules/sheet-drawings/useShapeClipboard";
import { useShapeDrawingTransfer } from "../../../../modules/sheet-drawings/useShapeDrawingTransfer";

export const rawEquationSource = "  \\frac{a}{b}\n\\unknown{exact}  ";

export function equationDrawing(
  id = "math",
  structured = true,
): SheetGraphicDrawing & { kind: "equation" } {
  const equationDocument: EquationDocument = {
    kind: "equation-document-v1",
    body: {
      kind: "sequence",
      id: "body",
      children: [
        {
          kind: "fraction",
          id: "fraction",
          style: "stacked",
          numerator: {
            kind: "sequence",
            id: "numerator",
            children: [{ kind: "text", id: "a", value: "a" }],
          },
          denominator: {
            kind: "sequence",
            id: "denominator",
            children: [{ kind: "latex", id: "opaque", value: "\\unknown{b}" }],
          },
        },
      ],
    },
  };
  return {
    ...createGraphicDrawing(id, "equation", "Equation", { row: 2, column: 1 }),
    kind: "equation",
    offsetX: 17,
    offsetY: 11,
    width: 310,
    height: 140,
    rotation: 37,
    text: structured ? serializeEquationDocument(equationDocument) : rawEquationSource,
    ...(structured ? { equationDocument } : {}),
  };
}

export function clipboardFixture(drawings: SheetDrawing[] = [equationDrawing()]) {
  const workbook = createWorkbook({ id: "book", sheetId: "source" });
  const source = getActiveSheet(workbook);
  const target = createSheet("Target", "target");
  workbook.sheets.set(target.id, target);
  source.drawings = normalizeShapeDrawingForest(drawings);
  const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
  let active = source;
  let metrics = createPictureSheetMetrics(active);
  let revision = 0;
  let generation = 0;
  let currentWorkbook = workbook;
  let paths: readonly ShapeGroupPath[] = [[drawings[0]!.id]];
  let address: CellAddress = { row: 4, column: 3 };
  let ids = 0;
  const scope = effectScope();
  const feedback = vi.fn();
  const selected = vi.fn();
  const createId = vi.fn(() => `fresh-${++ids}`);
  const execute = vi.fn((command: Parameters<typeof executeWorkbookCommand>[1]) => {
    const result = executeWorkbookCommand(session, command);
    if (result) revision++;
    return result;
  });
  const prepareDrawing = vi.fn((drawing: SheetDrawing) => drawing);
  const prepareTransfer = vi.fn(
    (_sheet: Sheet, _metrics: PictureSheetMetrics, drawing: SheetDrawing) => drawing,
  );
  const options = {
    getWorkbook: () => currentWorkbook,
    getSheet: () => active,
    getGeneration: () => generation,
    getRevision: () => revision,
    getDocumentRevision: () => session.history.revision,
    getMetrics: () => metrics,
    getAddress: () => address,
    isBusy: () => false,
    flush: () => true,
  };
  const actions = scope.run(() =>
    useDrawingActions({ ...options, execute, prepareDrawing, name: (kind) => kind }),
  )!;
  const transfer = useShapeDrawingTransfer({
    ...options,
    execute,
    prepareDrawing: prepareTransfer,
    preflightConnectedCollection: () => true,
  });
  const replaceCollection = vi.fn(actions.replaceCollectionPreservingGeometry);
  const replaceCollections = vi.fn(transfer.replaceCollections);
  const clipboard = useShapeClipboard({
    ...options,
    getSelectedPaths: () => paths,
    getTargetAddress: () => address,
    replaceCollection,
    replaceCollections,
    createId,
    onFeedback: feedback,
    onSelect: selected,
  });
  return {
    workbook,
    source,
    target,
    session,
    scope,
    actions,
    clipboard,
    execute,
    createId,
    prepareDrawing,
    prepareTransfer,
    replaceCollection,
    replaceCollections,
    feedback,
    selected,
    navigate(sheet = target) {
      active = sheet;
      workbook.activeSheetId = sheet.id;
      metrics = createPictureSheetMetrics(sheet);
      revision++;
    },
    select(next: readonly ShapeGroupPath[]) {
      paths = next;
    },
    address(next: CellAddress) {
      address = next;
    },
    stale(kind: string) {
      if (kind === "document-revision") session.history.revision++;
      else if (kind === "generation") generation++;
      else if (kind === "workbook")
        currentWorkbook = createWorkbook({ id: "replacement", sheetId: "source" });
      else if (kind === "sheet-identity") workbook.sheets.set(source.id, { ...source });
      else if (kind === "forest-identity")
        source.drawings = normalizeShapeDrawingForest(source.drawings ?? []);
      else if (kind === "geometry") source.columnWidths.set(0, 150);
      else if (kind === "in-place") source.drawings![0]!.name = "External edit";
    },
  };
}
