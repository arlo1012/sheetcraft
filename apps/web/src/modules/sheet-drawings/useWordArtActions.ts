import { readonly, ref } from "vue";
import { canUseSheetPermission } from "@sheetcraft/core";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { normalizeShapeDrawingForest } from "@sheetcraft/core/shape-group-planning";
import {
  isFramedShapeDrawing,
  normalizeSheetDrawing,
  type SheetDrawing,
  type SheetFramedGraphicDrawing,
} from "@sheetcraft/core/sheet-drawings";
import type { CellAddress, Sheet, Workbook } from "@sheetcraft/core/workbook";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import { createModernWordArtDrawing } from "./modern-wordart-insertion";
import type { WordArtStylePreset } from "./wordart-style-presets";

export type WordArtActionOptions = {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getGeneration: () => number;
  getRevision: () => number;
  getMetrics: () => PictureSheetMetrics | undefined;
  getAddress: () => CellAddress;
  isBusy: () => boolean;
  flush: () => boolean;
  /** The existing atomic drawing writer owns preparation, permission checks, commands and history. */
  replaceCollection: (
    next: readonly SheetDrawing[],
    expected: readonly SheetDrawing[],
    metrics: PictureSheetMetrics,
    guard: () => boolean,
  ) => boolean;
  name: () => string;
  placeholder: () => string;
  createId?: () => string;
  getFontFamily?: () => string | undefined;
  /** Prepare this actual text/family before the final collection proposal. False rejects insertion. */
  prepareFont?: (drawing: SheetFramedGraphicDrawing) => void | boolean | Promise<void | boolean>;
  /** Host selects this stored root and begins its real text editor with select-all. */
  onInserted?: (drawing: SheetFramedGraphicDrawing) => void;
};

type Handlers = Readonly<WordArtActionOptions>;
type Owner = {
  workbook: Workbook;
  sheet: Sheet;
  sheetId: string;
  generation: number;
  revision: number;
  address: CellAddress;
  metrics: PictureSheetMetrics;
  expected: readonly SheetDrawing[];
  forest: SheetDrawing[];
  fingerprint: string;
  handlers: Handlers;
  fontFamily: string | undefined;
};
const handlerKeys = [
  "getWorkbook",
  "getSheet",
  "getGeneration",
  "getRevision",
  "getMetrics",
  "getAddress",
  "isBusy",
  "flush",
  "replaceCollection",
  "name",
  "placeholder",
  "createId",
  "getFontFamily",
  "prepareFont",
  "onInserted",
] as const satisfies readonly (keyof WordArtActionOptions)[];

/** A strict owner lease surrounds asynchronous font work; no command or alternate writer is duplicated. */
export function useWordArtActions(options: WordArtActionOptions) {
  const idFactory = createBrowserIdFactory();
  const pending = ref(false);
  let operation = 0;

  function handlersCurrent(owner: Owner): boolean {
    return handlerKeys.every((key) => options[key] === owner.handlers[key]);
  }
  function sameAddress(left: CellAddress, right: CellAddress): boolean {
    return left.row === right.row && left.column === right.column;
  }
  function captureOwner(): Owner | undefined {
    const handlers = { ...options };
    const workbook = handlers.getWorkbook(),
      sheet = handlers.getSheet();
    const metrics = handlers.getMetrics();
    const generation = handlers.getGeneration(),
      revision = handlers.getRevision();
    if (
      !metrics ||
      workbook.sheets.get(sheet.id) !== sheet ||
      !Number.isSafeInteger(generation) ||
      generation < 0 ||
      !Number.isSafeInteger(revision) ||
      revision < 0
    )
      return;
    const source = sheet.drawings ?? [];
    const forest = normalizeShapeDrawingForest(source);
    const owner: Owner = {
      workbook,
      sheet,
      sheetId: sheet.id,
      generation,
      revision,
      metrics,
      address: { ...handlers.getAddress() },
      expected: [...source],
      forest,
      fingerprint: JSON.stringify(forest),
      handlers,
      fontFamily: handlers.getFontFamily?.(),
    };
    return currentOwner(owner) ? owner : undefined;
  }
  function sameContext(owner: Owner): boolean {
    return (
      handlersCurrent(owner) &&
      !options.isBusy() &&
      options.getWorkbook() === owner.workbook &&
      options.getSheet() === owner.sheet &&
      owner.sheet.id === owner.sheetId &&
      owner.workbook.sheets.get(owner.sheetId) === owner.sheet &&
      options.getGeneration() === owner.generation &&
      sameAddress(options.getAddress(), owner.address) &&
      options.getFontFamily?.() === owner.fontFamily &&
      canUseSheetPermission(owner.sheet, "editObjects")
    );
  }
  function currentOwner(owner: Owner): boolean {
    const source = owner.sheet.drawings ?? [];
    return (
      sameContext(owner) &&
      options.getRevision() === owner.revision &&
      options.getMetrics() === owner.metrics &&
      source.length === owner.expected.length &&
      source.every((root, index) => root === owner.expected[index]) &&
      JSON.stringify(normalizeShapeDrawingForest(source)) === owner.fingerprint
    );
  }
  async function insert(choice: WordArtStylePreset | string, requested?: Owner): Promise<boolean> {
    if (pending.value || options.isBusy()) return false;
    const token = ++operation;
    pending.value = true;
    try {
      if (requested && !currentOwner(requested)) return false;
      if (!options.flush() || token !== operation || (requested && !sameContext(requested)))
        return false;
      // Flush can commit active source text or change axis metrics. Capture its surviving owner now.
      const owner = captureOwner();
      if (!owner) return false;
      const drawing = createModernWordArtDrawing({
        id: owner.handlers.createId?.() ?? idFactory("drawing"),
        name: owner.handlers.name(),
        placeholder: owner.handlers.placeholder(),
        address: owner.address,
        metrics: owner.metrics,
        choice,
        ...(owner.fontFamily === undefined ? {} : { fontFamily: owner.fontFamily }),
      });
      const proposal = normalizeShapeDrawingForest([...owner.forest, drawing]);
      const guard = () => token === operation && currentOwner(owner);
      if (!guard()) return false;
      // A separate detached copy lets the readiness hook inspect without mutating the proposal.
      if (owner.handlers.prepareFont) {
        const ready = await owner.handlers.prepareFont(normalizeSheetDrawing(drawing));
        if (ready === false || !guard()) return false;
      }
      if (
        !guard() ||
        owner.handlers.replaceCollection(proposal, owner.expected, owner.metrics, guard) !== true
      )
        return false;
      // Read the canonical stored root after the writer's preparation; never fabricate an editor owner.
      const root = owner.sheet.drawings?.find((candidate) => candidate.id === drawing.id);
      if (!root || !isFramedShapeDrawing(root) || root.kind !== "shape" || root.wordArt !== true)
        return false;
      normalizeSheetDrawing(root);
      if (token === operation && sameContext(owner)) {
        try {
          owner.handlers.onInserted?.(root);
        } catch {
          /* The document command already committed. */
        }
      }
      return true;
    } catch {
      return false;
    } finally {
      if (token === operation) pending.value = false;
    }
  }
  function createInsertHandler(): (choice: WordArtStylePreset | string) => Promise<boolean> {
    let owner: Owner | undefined;
    try {
      owner = captureOwner();
    } catch {
      /* A stale/invalid rendered owner cannot insert. */
    }
    return (choice) => (owner ? insert(choice, owner) : Promise.resolve(false));
  }
  function cancelPending(): void {
    operation++;
    pending.value = false;
  }
  return { insert, createInsertHandler, cancelPending, pending: readonly(pending) };
}
