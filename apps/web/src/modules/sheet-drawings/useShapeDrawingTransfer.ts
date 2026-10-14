import {
  createReplaceSheetDrawingCollectionsCommand,
  type WorkbookCommand,
} from "@sheetcraft/core/commands";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { isShapeGroupDrawing, traverseShapeGroup } from "@sheetcraft/core/shape-group";
import { normalizeShapeDrawingForest } from "@sheetcraft/core/shape-group-planning";
import { canEditSheetDrawingCollection } from "@sheetcraft/core/shape-protection";
import type { SheetDrawing } from "@sheetcraft/core/sheet-drawings";
import type { Sheet, Workbook } from "@sheetcraft/core/workbook";
import {
  assertEquationForestSourcesPreserved,
  assertEquationGeometryPreserved,
  assertEquationSourcePreserved,
  type EquationSourceCarrier,
} from "./equation/equation-source-ownership";
import {
  resolveShapeForestForRender,
  type ResolvedShapeForestForRender,
} from "./resolved-shape-render-source";

export type ShapeDrawingTransferCollection = {
  sheet: Sheet;
  expected: readonly SheetDrawing[];
  next: readonly SheetDrawing[];
  metrics: PictureSheetMetrics;
  equationSources?: readonly { sourceId: string; targetId: string }[];
};

/** Both sheets are admitted against their own geometry before one Core command. */
export function useShapeDrawingTransfer(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getGeneration: () => number;
  getRevision: () => number;
  isBusy: () => boolean;
  execute: (command: WorkbookCommand) => unknown;
  prepareDrawing: (
    sheet: Sheet,
    metrics: PictureSheetMetrics,
    drawing: SheetDrawing,
    owner: SheetDrawing | undefined,
    forest: readonly SheetDrawing[],
  ) => SheetDrawing;
  preflightConnectedCollection: (pass: ResolvedShapeForestForRender) => boolean;
}) {
  let working = false;
  function replaceCollections(
    collections: readonly [ShapeDrawingTransferCollection, ShapeDrawingTransferCollection],
    guard: () => boolean,
  ): boolean {
    if (working || options.isBusy()) return false;
    working = true;
    try {
      const workbook = options.getWorkbook(),
        active = options.getSheet(),
        generation = options.getGeneration(),
        revision = options.getRevision();
      if (collections[0].sheet === collections[1].sheet) return false;
      const leases = collections.map((collection) => ({
        ...collection,
        expected: [...collection.expected],
        fingerprint: JSON.stringify(normalizeShapeDrawingForest(collection.expected)),
      }));
      const current = () =>
        !options.isBusy() &&
        options.getWorkbook() === workbook &&
        options.getSheet() === active &&
        options.getGeneration() === generation &&
        options.getRevision() === revision &&
        guard() &&
        leases.every((lease) => {
          const forest = lease.sheet.drawings ?? [];
          return (
            workbook.sheets.get(lease.sheet.id) === lease.sheet &&
            forest.length === lease.expected.length &&
            forest.every((root, index) => root === lease.expected[index]) &&
            JSON.stringify(normalizeShapeDrawingForest(forest)) === lease.fingerprint
          );
        });
      if (!current()) return false;
      const nodes = (forest: readonly SheetDrawing[]): Map<string, EquationSourceCarrier> => {
        const result = new Map<string, EquationSourceCarrier>();
        for (const root of forest)
          for (const node of root.kind === "shapeGroup"
            ? traverseShapeGroup(root).map((visit) => visit.node)
            : [root]) {
            if (result.has(node.id)) throw new TypeError("Duplicate drawing identity.");
            result.set(node.id, node);
          }
        return result;
      };
      const prepared = leases.map((lease, index) => {
        const proposed = normalizeShapeDrawingForest(lease.next);
        assertEquationForestSourcesPreserved(lease.expected, proposed);
        const priorNodes = nodes(lease.expected),
          incoming = nodes(proposed);
        const sourceNodes = nodes(leases[1 - index]!.expected);
        const transferred = new Set<string>();
        for (const pair of lease.equationSources ?? []) {
          const source = sourceNodes.get(pair.sourceId),
            target = incoming.get(pair.targetId);
          if (
            source?.kind !== "equation" ||
            !target ||
            priorNodes.has(pair.targetId) ||
            transferred.has(pair.targetId)
          )
            throw new TypeError("A mathematical transfer requires its exact source provenance.");
          assertEquationGeometryPreserved(source, target);
          transferred.add(pair.targetId);
        }
        for (const [id, node] of incoming)
          if (
            node.kind === "equation" &&
            priorNodes.get(id)?.kind !== "equation" &&
            !transferred.has(id)
          )
            throw new TypeError("A new mathematical transfer identity has no captured source.");
        if (!canEditSheetDrawingCollection(lease.sheet, proposed) || !current())
          throw new Error("The transfer owner or permissions changed.");
        const owners = new Map(lease.expected.map((root) => [root.id, root]));
        const fingerprints = new Map(
          normalizeShapeDrawingForest(lease.expected).map((root) => [
            root.id,
            JSON.stringify(root),
          ]),
        );
        const drawings = proposed.map((drawing) => {
          if (!current()) throw new Error("The transfer owner changed.");
          const owner = owners.get(drawing.id);
          if (owner) assertEquationSourcePreserved(owner, drawing);
          const candidate =
            owner && fingerprints.get(drawing.id) === JSON.stringify(drawing)
              ? owner
              : options.prepareDrawing(lease.sheet, lease.metrics, drawing, owner, proposed);
          if (candidate.id !== drawing.id || candidate.kind !== drawing.kind || !current())
            throw new Error("The transfer changed an object identity.");
          assertEquationSourcePreserved(drawing, candidate);
          return candidate;
        });
        assertEquationForestSourcesPreserved(proposed, drawings);
        const preparedNodes = nodes(drawings);
        for (const [id, node] of incoming)
          if (node.kind === "equation") {
            const preparedNode = preparedNodes.get(id);
            if (!preparedNode)
              throw new TypeError("A prepared mathematical transfer lost its source.");
            assertEquationGeometryPreserved(node, preparedNode);
          }
        const pass = resolveShapeForestForRender({ drawings, metrics: lease.metrics, revision });
        const connected = drawings.some((root) =>
          isShapeGroupDrawing(root)
            ? traverseShapeGroup(root).some(({ node }) => "shapeConnector" in node)
            : "shapeConnector" in root,
        );
        if (connected && !options.preflightConnectedCollection(pass))
          throw new Error("The transfer appearance is not ready.");
        if (!current() || !canEditSheetDrawingCollection(lease.sheet, drawings))
          throw new Error("The transfer owner or permissions changed.");
        return { sheetId: lease.sheet.id, expectedDrawings: lease.expected, drawings };
      });
      const command = createReplaceSheetDrawingCollectionsCommand(prepared);
      const applied = () =>
        options.getWorkbook() === workbook &&
        options.getGeneration() === generation &&
        command.collections.every(
          (entry) =>
            workbook.sheets.has(entry.sheetId) &&
            JSON.stringify(workbook.sheets.get(entry.sheetId)!.drawings ?? []) ===
              JSON.stringify(entry.drawings),
        );
      if (!current()) return false;
      try {
        options.execute(command);
      } catch {
        return applied();
      }
      return applied();
    } catch {
      return false;
    } finally {
      working = false;
    }
  }
  return { replaceCollections };
}
