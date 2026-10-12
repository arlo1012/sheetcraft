import { getCurrentScope, onScopeDispose, shallowRef, watch } from "vue";
import { canUseSheetPermission } from "@sheetcraft/core";
import { createSetSheetDrawingsCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import { normalizeSheetDrawing, type SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import type { CellAddress, Sheet, Workbook } from "@sheetcraft/core/workbook";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import { createGraphicDrawing } from "./drawing-defaults";
import { getDrawingShapeGeometry } from "./shape-geometry";
import type { ShapeGalleryChoice } from "./shape-gallery";

export type ShapeCreationOwner = Readonly<{
  workbook: Workbook;
  sheet: Sheet;
  generation?: number;
}>;
export type ShapeCreationRequest = ShapeCreationOwner &
  Readonly<{
    requestId: number;
    revision?: number;
    choice: ShapeGalleryChoice;
    continuous: boolean;
    base: SheetGraphicDrawing;
  }>;
export function useShapeCreation(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getGeneration?: () => number;
  getRevision?: () => number;
  getAddress: () => CellAddress;
  isBusy: () => boolean;
  flush: () => boolean;
  execute: (command: WorkbookCommand) => unknown;
  name?: (choice: ShapeCreationRequest["choice"]) => string;
  onStart?: () => void;
  onCreated?: (drawing: SheetGraphicDrawing) => void;
}) {
  const idFactory = createBrowserIdFactory();
  const request = shallowRef<ShapeCreationRequest>();
  let generation = 0,
    disposed = false,
    committing = false;
  const captureOwner = (): ShapeCreationOwner => ({
    workbook: options.getWorkbook(),
    sheet: options.getSheet(),
    generation: options.getGeneration?.(),
  });
  const validOwner = (owner: ShapeCreationOwner) =>
    !disposed &&
    options.getWorkbook() === owner.workbook &&
    options.getSheet() === owner.sheet &&
    owner.workbook.sheets.get(owner.sheet.id) === owner.sheet &&
    options.getGeneration?.() === owner.generation;
  const allowed = (owner: ShapeCreationOwner) =>
    validOwner(owner) && !options.isBusy() && canUseSheetPermission(owner.sheet, "editObjects");
  function cancel(current = request.value): void {
    if (current && request.value !== current) return;
    generation++;
    request.value = undefined;
  }
  function makeRequest(
    owner: ShapeCreationOwner,
    choice: ShapeCreationRequest["choice"],
    continuous: boolean,
  ): ShapeCreationRequest {
    const kind = choice.kind === "textBox" ? "textBox" : "shape";
    return {
      ...owner,
      requestId: ++generation,
      revision: options.getRevision?.(),
      choice,
      continuous,
      base: {
        ...createGraphicDrawing(
          idFactory("drawing"),
          kind,
          options.name?.(choice) ?? choice.label["en-US"],
          options.getAddress(),
          choice.kind === "textBox" ? choice.direction : undefined,
        ),
        text: "",
      },
    };
  }
  function start(choice: ShapeGalleryChoice, continuous: boolean, owner = captureOwner()): boolean {
    if (committing || !allowed(owner)) return false;
    const token = ++generation;
    if (!options.flush() || token !== generation || !allowed(owner)) return false;
    options.onStart?.();
    if (token !== generation || !allowed(owner)) return false;
    request.value = makeRequest(owner, choice, continuous);
    return true;
  }
  function commit(current: ShapeCreationRequest, value: SheetGraphicDrawing): boolean {
    if (
      committing ||
      request.value !== current ||
      !allowed(current) ||
      options.getRevision?.() !== current.revision ||
      value.id !== current.base.id ||
      value.kind !== current.base.kind
    )
      return false;
    let drawing: SheetGraphicDrawing;
    try {
      drawing = normalizeSheetDrawing(value) as SheetGraphicDrawing;
    } catch {
      return false;
    }
    if (drawing.kind === "shape") {
      if (current.choice.kind === "drawingTool") {
        if (drawing.shapePath?.tool !== current.choice.tool || drawing.shapeGeometry) return false;
      } else if (
        current.choice.kind !== "textBox" &&
        (drawing.shapeGeometry?.preset !== current.choice.preset || drawing.shapePath)
      )
        return false;
      if (!getDrawingShapeGeometry(drawing)) return false;
    }
    if ((current.sheet.drawings ?? []).some((item) => item.id === drawing.id)) return false;
    let command: ReturnType<typeof createSetSheetDrawingsCommand>;
    try {
      command = createSetSheetDrawingsCommand(current.sheet.id, [
        ...(current.sheet.drawings ?? []),
        drawing,
      ]);
    } catch {
      return false;
    }
    const applied = () =>
      JSON.stringify(current.sheet.drawings ?? []) === JSON.stringify(command.drawings);
    committing = true;
    try {
      try {
        if (options.execute(command) === false && !applied()) return false;
      } catch {
        // The workspace may throw while updating calculation/selection after
        // its atomic Core/history mutation. A new unique ID proves this exact
        // collection has already been inserted and must not be retried.
        if (!applied()) return false;
      }
      // A durable Core transaction stays successful even if optional focus or
      // next-mode UI callbacks fail. Never offer retry for an already inserted ID.
      if (request.value !== current || !validOwner(current)) return true;
      request.value = undefined;
      try {
        if (current.continuous && allowed(current))
          request.value = makeRequest(current, current.choice, true);
      } catch {
        /* Stop the mode safely if a fresh identity cannot be prepared. */
      }
      try {
        options.onCreated?.(drawing);
      } catch {
        /* Optional selection failure must not turn success into rejection. */
      }
      return true;
    } finally {
      committing = false;
    }
  }
  if (getCurrentScope()) {
    watch(
      () => [
        options.getWorkbook(),
        options.getSheet(),
        options.getGeneration?.(),
        options.getRevision?.(),
        options.isBusy(),
        options.getSheet().properties.protected,
        options.getSheet().protection?.editObjects,
      ],
      () => {
        const current = request.value;
        if (
          current &&
          !committing &&
          (!allowed(current) || options.getRevision?.() !== current.revision)
        )
          cancel(current);
      },
      { flush: "sync" },
    );
    onScopeDispose(() => {
      disposed = true;
      cancel();
    });
  }
  return { request, captureOwner, start, commit, cancel };
}
