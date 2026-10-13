import { assertShapeObjectsForSheet } from "@sheetcraft/core/shape-object-sheet";
import {
  isShapeGroupDrawing,
  traverseShapeGroup,
  type SheetGroupedGraphicDrawing,
} from "@sheetcraft/core/shape-group";
import { normalizeSheetDrawings } from "@sheetcraft/core/sheet-drawings";
import { deserializeSheet } from "@sheetcraft/core/serialization";
import type { WorkbookCommand } from "@sheetcraft/core/commands";
import type { SheetDrawing } from "@sheetcraft/core/sheet-drawings";
import type { Workbook } from "@sheetcraft/core/workbook";

/** Kept for old recovery diagnostics; canonical shapes now have live consumers. */
export class UnsupportedShapeFrameDocumentError extends Error {
  readonly code = "unsupported-shape-frame";
  constructor(
    readonly sheetId: string,
    readonly drawingIds: readonly string[],
  ) {
    super(
      `Canonical shape placement is not yet enabled for this consumer (sheet ${sheetId}, objects ${drawingIds.join(", ")}).`,
    );
    this.name = "UnsupportedShapeFrameDocumentError";
  }
}
/** Raw leaf/group consumers still require an explicit whole-worksheet render pass. */
export class UnsupportedShapeConnectorDocumentError extends UnsupportedShapeFrameDocumentError {
  constructor(sheetId: string, drawingIds: readonly string[]) {
    super(sheetId, drawingIds);
    this.name = "UnsupportedShapeConnectorDocumentError";
    this.message = `Live shape connector rendering requires a complete worksheet relation pass (sheet ${sheetId}, objects ${drawingIds.join(", ")}).`;
  }
}
/** A scene relation must never silently fall back to unprojected connector sites. */
export class UnsupportedShapeGroup3dDocumentError extends UnsupportedShapeFrameDocumentError {
  constructor(sheetId: string, drawingIds: readonly string[]) {
    super(sheetId, drawingIds);
    this.name = "UnsupportedShapeGroup3dDocumentError";
    this.message = `Shared group 3D scene rendering is not yet enabled for this consumer (sheet ${sheetId}, objects ${drawingIds.join(", ")}).`;
  }
}
export function assertNoUnresolvedShapeGroup3d(
  sheetId: string,
  drawings: readonly SheetDrawing[] | undefined,
): void {
  const ids: string[] = [];
  for (const root of drawings ?? []) {
    if (!isShapeGroupDrawing(root)) continue;
    for (const { node } of traverseShapeGroup(root))
      if (node.kind === "shapeGroup" && Object.hasOwn(node, "group3d")) ids.push(node.id);
  }
  if (ids.length) throw new UnsupportedShapeGroup3dDocumentError(sheetId, ids);
}
/** A shared body camera does not yet project connector ports/routes. Inspect the
 * complete forest, including external bindings into hidden or nested scene members. */
export function assertSupportedShapeGroupScenes(
  sheetId: string,
  drawings: readonly SheetDrawing[] | undefined,
): void {
  const affected = new Set<string>();
  const connectors: (SheetDrawing | SheetGroupedGraphicDrawing)[] = [];
  for (const root of drawings ?? []) {
    if (!isShapeGroupDrawing(root)) {
      if ("shapeConnector" in root) connectors.push(root);
      if (
        (root.kind === "shape" || root.kind === "textBox") &&
        !root.shapeConnector &&
        root.shapeStyle?.rotation3d?.kind === "value"
      )
        affected.add(root.id);
      continue;
    }
    const activePaths = new Map<string, boolean>();
    for (const { node, path, parentPath } of traverseShapeGroup(root)) {
      const inherited = parentPath && activePaths.get(JSON.stringify(parentPath));
      const active =
        !!inherited || (node.kind === "shapeGroup" && node.group3d?.rotation3d.kind === "value");
      activePaths.set(JSON.stringify(path), active);
      if (active) affected.add(node.id);
      if (
        node.kind !== "shapeGroup" &&
        !node.shapeConnector &&
        node.shapeStyle?.rotation3d?.kind === "value"
      )
        affected.add(node.id);
      if ("shapeConnector" in node) connectors.push(node);
    }
  }
  const blocked = connectors.filter((node) => {
    if (!("shapeConnector" in node) || !node.shapeConnector) return false;
    return (
      affected.has(node.id) ||
      [node.shapeConnector.begin, node.shapeConnector.end].some(
        (endpoint) => endpoint.kind === "site" && affected.has(endpoint.targetId),
      )
    );
  });
  if (blocked.length) {
    const error = new UnsupportedShapeGroup3dDocumentError(
      sheetId,
      blocked.map((node) => node.id),
    );
    error.message = `Shape 3D projection cannot currently include a connector or a bound connector target (sheet ${sheetId}, connectors ${blocked.map((node) => node.id).join(", ")}).`;
    throw error;
  }
}
export function assertNoUnresolvedShapeConnectors(
  sheetId: string,
  drawings: readonly SheetDrawing[] | undefined,
): void {
  const ids: string[] = [];
  for (const root of drawings ?? [])
    for (const node of isShapeGroupDrawing(root)
      ? traverseShapeGroup(root).map(({ node }) => node)
      : [root])
      if ("shapeConnector" in node) ids.push(node.id);
  if (ids.length) throw new UnsupportedShapeConnectorDocumentError(sheetId, ids);
}
function checkDrawings(sheetId: string, drawings: readonly SheetDrawing[] | undefined): void {
  // Whole-forest normalization validates every reference before history or replacement.
  // Raw carrier projectors retain their independent explicit rejection above.
  assertSupportedShapeGroupScenes(sheetId, normalizeSheetDrawings(drawings));
}
export function assertWorkbookShapeSupport(workbook: Workbook): void {
  for (const sheet of workbook.sheets.values()) {
    checkDrawings(sheet.id, sheet.drawings);
    assertShapeObjectsForSheet(sheet.drawings, sheet);
  }
}

function requireOwnDataRecord(value: object): void {
  for (const key of Reflect.ownKeys(value)) {
    if (!("value" in Object.getOwnPropertyDescriptor(value, key)!))
      throw new TypeError("Shape admission requires data payloads without accessors.");
  }
}
function checkState(sheetId: string, state: { drawings?: SheetDrawing[] }): void {
  requireOwnDataRecord(state);
  checkDrawings(sheetId, state.drawings);
}
function requireOwnDataArray<T extends object>(values: readonly T[]): void {
  if (!Array.isArray(values) || Object.getPrototypeOf(values) !== Array.prototype)
    throw new TypeError("Shape admission requires an ordinary dense data array.");
  requireOwnDataRecord(values);
  for (const key of Reflect.ownKeys(values)) {
    if (
      key !== "length" &&
      (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= values.length)
    )
      throw new TypeError("Command arrays cannot override traversal methods.");
  }
  for (let index = 0; index < values.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(values, String(index));
    if (!descriptor || !("value" in descriptor)) throw new TypeError("Sparse command payload.");
    requireOwnDataRecord(descriptor.value as object);
  }
}

/** Validate incoming data before mutations, history, or view consumers. */
export function assertShapeCommandSupport(command: WorkbookCommand): void {
  requireOwnDataRecord(command);
  const type = Object.getOwnPropertyDescriptor(command, "type");
  if (!type || !("value" in type)) throw new TypeError("Command type must be an own data field.");
  switch (command.type) {
    case "setSheetDrawings":
      checkDrawings(command.sheetId, command.drawings);
      break;
    case "addSheet": {
      requireOwnDataRecord(command.sheet);
      const sheet = deserializeSheet(command.sheet);
      checkDrawings(sheet.id, sheet.drawings);
      break;
    }
    case "restoreCellShift":
      checkState(command.sheetId, command.state);
      break;
    case "restoreSheetState":
      if ("state" in command) checkState(command.sheetId, command.state);
      else {
        requireOwnDataRecord(command.slice);
        checkState(command.sheetId, command.slice.metadata);
      }
      break;
    case "restoreTableTransaction":
      requireOwnDataArray(command.states);
      for (const state of command.states) checkState(state.sheetId, state.state);
      break;
    case "batchDeleteSheetAxes":
      requireOwnDataArray(command.commands);
      for (const nested of command.commands) assertShapeCommandSupport(nested);
      break;
  }
}
