import { canUseSheetPermission } from "@sheetcraft/core";
import { shallowRef } from "vue";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import {
  isShapeGroupDrawing,
  traverseShapeGroup,
  type ShapeGroupPath,
} from "@sheetcraft/core/shape-group";
import { normalizeShapeDrawingForest } from "@sheetcraft/core/shape-group-planning";
import { canEditShapeObject } from "@sheetcraft/core/shape-protection";
import type { SheetDrawing } from "@sheetcraft/core/sheet-drawings";
import type { CellAddress, Sheet, Workbook } from "@sheetcraft/core/workbook";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import {
  captureShapeClipboardSelection,
  planShapeClipboardPaste,
  planCrossSheetShapeClipboardCut,
  ShapeClipboardError,
  type ShapeClipboardFailure,
  type ShapeClipboardSelection,
} from "./shape-clipboard-planning";
import type { ShapeDrawingTransferCollection } from "./useShapeDrawingTransfer";

export type ShapeClipboardIdentity = Readonly<{ token: string; generation: number }>;
export type ShapeClipboardOptions = {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getGeneration: () => number;
  getRevision: () => number;
  /** A document history revision: worksheet navigation must not invalidate Cut. */
  getDocumentRevision?: () => number;
  getMetrics: () => PictureSheetMetrics | undefined;
  getSelectedPaths: () => readonly ShapeGroupPath[];
  getTargetAddress: () => CellAddress;
  /** A single atomic collection transaction, normally useDrawingActions.replaceCollection. */
  replaceCollection: (
    next: readonly SheetDrawing[],
    expected: readonly SheetDrawing[],
    metrics: PictureSheetMetrics,
    guard: () => boolean,
  ) => boolean;
  replaceCollections?: (
    collections: readonly [ShapeDrawingTransferCollection, ShapeDrawingTransferCollection],
    guard: () => boolean,
  ) => boolean;
  createId?: () => string;
  flush?: () => boolean;
  isBusy?: () => boolean;
  onSelect?: (paths: readonly ShapeGroupPath[]) => void;
  onCopy?: (mode: "copy" | "cut") => void;
  onFeedback?: (reason: ShapeClipboardFailure) => void;
};

type Owner = {
  workbook: Workbook;
  sheet: Sheet;
  sheetId: string;
  generation: number;
  revision: number;
  documentRevision: number;
  metrics: PictureSheetMetrics;
  expected: readonly SheetDrawing[];
  fingerprint: string;
  geometryFingerprint: string;
};

export type ShapeClipboardTransferConfirmation = {
  sessionId: number;
  sourceSheetName: string;
  targetSheetName: string;
  disconnectedEndpoints: { moved: number; remaining: number; total: number };
  confirm: () => boolean;
  cancel: () => void;
  isCurrent: () => boolean;
};

function geometryFingerprint(sheet: Sheet): string {
  return JSON.stringify({
    defaultColumnWidth: sheet.defaultColumnWidth,
    rowHeights: [...sheet.rowHeights],
    columnWidths: [...sheet.columnWidths],
    hiddenRows: [...(sheet.hiddenRows ?? [])],
    hiddenColumns: [...(sheet.hiddenColumns ?? [])],
    filter: sheet.filter,
    tables: sheet.tables,
    outlineGroups: sheet.outlineGroups,
    mergedCells: sheet.mergedCells,
  });
}
type Pending = {
  identity: ShapeClipboardIdentity;
  mode: "copy" | "cut";
  owner: Owner;
  selection: ShapeClipboardSelection;
};

/** Document-local object data only. No HTML, blobs, assets or private trees enter the OS clipboard. */
export function useShapeClipboard(options: ShapeClipboardOptions) {
  const idFactory = createBrowserIdFactory();
  const createId = options.createId ?? (() => idFactory("drawing"));
  let pending: Pending | undefined;
  let generation = 0;
  let operation = 0;
  let working = false;
  let confirmationId = 0;
  const confirmation = shallowRef<ShapeClipboardTransferConfirmation>();

  function feedback(reason: ShapeClipboardFailure): void {
    try {
      options.onFeedback?.(reason);
    } catch {
      // UI observers cannot change whether a document operation committed.
    }
  }
  function owner(): Owner | undefined {
    const workbook = options.getWorkbook();
    const sheet = options.getSheet();
    const metrics = options.getMetrics();
    const generation = options.getGeneration();
    const revision = options.getRevision();
    const documentRevision = options.getDocumentRevision?.() ?? revision;
    if (
      !metrics ||
      workbook.sheets.get(sheet.id) !== sheet ||
      !Number.isSafeInteger(generation) ||
      generation < 0 ||
      !Number.isSafeInteger(revision) ||
      revision < 0 ||
      !Number.isSafeInteger(documentRevision) ||
      documentRevision < 0
    )
      return undefined;
    const source = sheet.drawings ?? [];
    const fingerprint = JSON.stringify(normalizeShapeDrawingForest(source));
    return {
      workbook,
      sheet,
      sheetId: sheet.id,
      generation,
      revision,
      documentRevision,
      metrics,
      expected: [...source],
      fingerprint,
      geometryFingerprint: geometryFingerprint(sheet),
    };
  }
  function currentCutSource(expected: Owner): boolean {
    if (!options.getDocumentRevision) return currentOwner(expected);
    const forest = expected.sheet.drawings ?? [];
    return (
      !options.isBusy?.() &&
      options.getWorkbook() === expected.workbook &&
      expected.sheet.id === expected.sheetId &&
      expected.workbook.sheets.get(expected.sheetId) === expected.sheet &&
      options.getGeneration() === expected.generation &&
      (options.getDocumentRevision?.() ?? options.getRevision()) === expected.documentRevision &&
      geometryFingerprint(expected.sheet) === expected.geometryFingerprint &&
      forest.length === expected.expected.length &&
      forest.every((root, index) => root === expected.expected[index]) &&
      JSON.stringify(normalizeShapeDrawingForest(forest)) === expected.fingerprint
    );
  }
  function currentOwner(expected: Owner): boolean {
    const current = expected.sheet.drawings ?? [];
    const fingerprint = JSON.stringify(normalizeShapeDrawingForest(current));
    return (
      !options.isBusy?.() &&
      options.getWorkbook() === expected.workbook &&
      options.getSheet() === expected.sheet &&
      expected.sheet.id === expected.sheetId &&
      expected.workbook.sheets.get(expected.sheetId) === expected.sheet &&
      options.getGeneration() === expected.generation &&
      options.getRevision() === expected.revision &&
      options.getMetrics() === expected.metrics &&
      current.length === expected.expected.length &&
      current.every((root, index) => root === expected.expected[index]) &&
      fingerprint === expected.fingerprint
    );
  }
  function sourceAllowed(captured: Pending): boolean {
    const source = captured.owner;
    if (
      options.getWorkbook() !== source.workbook ||
      options.getGeneration() !== source.generation ||
      source.sheet.id !== source.sheetId ||
      source.workbook.sheets.get(source.sheetId) !== source.sheet
    )
      return false;
    const roots = normalizeShapeDrawingForest(source.sheet.drawings ?? []);
    const byId = new Map(roots.map((root) => [root.id, root]));
    const paths = new Map<string, ShapeGroupPath>();
    for (const root of roots)
      if (isShapeGroupDrawing(root))
        for (const visit of traverseShapeGroup(root)) paths.set(visit.node.id, visit.path);
      else paths.set(root.id, [root.id]);
    return captured.selection.selectedPaths.every((path) => {
      const root = byId.get(path[0]!);
      const currentPath = paths.get(path.at(-1)!);
      return (
        !!root &&
        canEditShapeObject(source.sheet, root) &&
        currentPath?.length === path.length &&
        path.every((id, index) => currentPath[index] === id)
      );
    });
  }
  function sameIdentity(identity: ShapeClipboardIdentity): boolean {
    return (
      !!pending &&
      pending.identity.token === identity.token &&
      pending.identity.generation === identity.generation
    );
  }
  function clear(identity = pending?.identity): boolean {
    if (!identity || !sameIdentity(identity)) return false;
    pending = undefined;
    confirmation.value = undefined;
    operation++;
    generation++;
    return true;
  }
  function capture(mode: "copy" | "cut", paths?: readonly ShapeGroupPath[]): boolean {
    if (working || options.isBusy?.()) return false;
    working = true;
    const started = operation;
    try {
      if (options.flush?.() === false) throw new ShapeClipboardError("unavailable-owner");
      const source = owner();
      if (!source) throw new ShapeClipboardError("unavailable-owner");
      const selection = captureShapeClipboardSelection(
        source.expected,
        paths ?? options.getSelectedPaths(),
        source.metrics,
      );
      const next: Pending = {
        identity: Object.freeze({
          token: idFactory("shape-clipboard"),
          generation: generation + 1,
        }),
        mode,
        owner: source,
        selection,
      };
      if (!sourceAllowed(next)) throw new ShapeClipboardError("source-protected");
      if (operation !== started || !currentOwner(source))
        throw new ShapeClipboardError("stale-owner");
      pending = next;
      confirmation.value = undefined;
      generation++;
      operation++;
      try {
        options.onCopy?.(mode);
      } catch {
        // Capturing succeeded; a notification exception must not invalidate it.
      }
      return true;
    } catch (error) {
      feedback(error instanceof ShapeClipboardError ? error.reason : "invalid-selection");
      return false;
    } finally {
      working = false;
    }
  }
  function paste(address?: CellAddress): boolean {
    const captured = pending;
    if (!captured || working || confirmation.value || options.isBusy?.()) return false;
    working = true;
    const started = operation;
    try {
      if (options.flush?.() === false) throw new ShapeClipboardError("unavailable-owner");
      const target = owner();
      if (!target) throw new ShapeClipboardError("unavailable-owner");
      if (
        target.workbook !== captured.owner.workbook ||
        target.generation !== captured.owner.generation
      )
        throw new ShapeClipboardError("stale-owner");
      const crossSheet = captured.mode === "cut" && target.sheet !== captured.owner.sheet;
      if (crossSheet && (!options.replaceCollections || !options.getDocumentRevision))
        throw new ShapeClipboardError("cross-sheet-cut");
      if (captured.mode === "cut" && !currentCutSource(captured.owner))
        throw new ShapeClipboardError("stale-owner");
      if (!sourceAllowed(captured)) throw new ShapeClipboardError("source-protected");
      if (!canUseSheetPermission(target.sheet, "editObjects"))
        throw new ShapeClipboardError("target-protected");
      const navigationAddress = { ...options.getTargetAddress() };
      const guard = () =>
        operation === started &&
        pending === captured &&
        currentOwner(target) &&
        options.getTargetAddress().row === navigationAddress.row &&
        options.getTargetAddress().column === navigationAddress.column &&
        (captured.mode !== "cut" || currentCutSource(captured.owner)) &&
        sourceAllowed(captured) &&
        canUseSheetPermission(target.sheet, "editObjects");
      const complete = () => {
        if (captured.mode === "cut" && pending === captured) clear(captured.identity);
        try {
          options.onSelect?.(placedPaths);
        } catch {
          // The atomic document transaction has already succeeded.
        }
      };
      let placedPaths: readonly ShapeGroupPath[] = [];
      if (crossSheet) {
        const plan = planCrossSheetShapeClipboardCut({
          selection: captured.selection,
          targetForest: target.expected,
          sourceMetrics: captured.owner.metrics,
          targetMetrics: target.metrics,
          address: address ?? options.getTargetAddress(),
          createId,
        });
        placedPaths = plan.roots.map((root) => [root.id]);
        const collections = [
          {
            sheet: captured.owner.sheet,
            expected: captured.owner.expected,
            next: plan.sourceForest,
            metrics: captured.owner.metrics,
          },
          {
            sheet: target.sheet,
            expected: target.expected,
            next: plan.targetForest,
            equationSources: plan.equationSources,
            metrics: target.metrics,
          },
        ] as const;
        const commit = () => {
          if (!guard()) throw new ShapeClipboardError("stale-owner");
          if (!options.replaceCollections!(collections, guard))
            throw new ShapeClipboardError("command-rejected");
          complete();
          return true;
        };
        if (!guard()) throw new ShapeClipboardError("stale-owner");
        if (!plan.disconnectedEndpoints.total) return commit();
        const request: ShapeClipboardTransferConfirmation = {
          sessionId: ++confirmationId,
          sourceSheetName: captured.owner.sheet.name,
          targetSheetName: target.sheet.name,
          disconnectedEndpoints: { ...plan.disconnectedEndpoints },
          isCurrent: () => confirmation.value === request && guard(),
          cancel: () => {
            if (confirmation.value !== request) return;
            confirmation.value = undefined;
            operation++;
          },
          confirm: () => {
            if (confirmation.value !== request || working) return false;
            working = true;
            try {
              const accepted = commit();
              if (confirmation.value === request) confirmation.value = undefined;
              return accepted;
            } catch (error) {
              if (confirmation.value === request) confirmation.value = undefined;
              feedback(error instanceof ShapeClipboardError ? error.reason : "command-rejected");
              return false;
            } finally {
              working = false;
            }
          },
        };
        confirmation.value = request;
        return false;
      }
      const plan = planShapeClipboardPaste({
        selection: captured.selection,
        mode: captured.mode,
        targetForest: target.expected,
        sourceMetrics: captured.owner.metrics,
        targetMetrics: target.metrics,
        address: address ?? options.getTargetAddress(),
        createId,
      });
      placedPaths = plan.roots.map((root) => [root.id]);
      if (!guard()) throw new ShapeClipboardError("stale-owner");
      // Cut removal and insertion are in this one proposal; a failed command consumes nothing.
      if (
        options.replaceCollection(plan.nextForest, target.expected, target.metrics, guard) !== true
      )
        throw new ShapeClipboardError("command-rejected");
      complete();
      return true;
    } catch (error) {
      feedback(error instanceof ShapeClipboardError ? error.reason : "command-rejected");
      return false;
    } finally {
      working = false;
    }
  }
  return {
    copy: (paths?: readonly ShapeGroupPath[]) => capture("copy", paths),
    cut: (paths?: readonly ShapeGroupPath[]) => capture("cut", paths),
    paste,
    hasPending: () => !!pending,
    getMode: () => pending?.mode,
    getIdentity: (): ShapeClipboardIdentity | undefined =>
      pending ? Object.freeze({ ...pending.identity }) : undefined,
    clear,
    clearCut: (identity = pending?.identity) => pending?.mode === "cut" && clear(identity),
    confirmation,
  };
}
