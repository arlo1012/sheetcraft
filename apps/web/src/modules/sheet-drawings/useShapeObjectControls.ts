import { computed, ref } from "vue";
import { isShapeObjectPathVisible } from "./shape-visibility";
import type { Workbook, Sheet } from "@sheetcraft/core/workbook";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import {
  findShapeGroupNode,
  isShapeGroupDrawing,
  type ShapeGroupPath,
  type ShapeGroupNode,
  type ShapeGroupChild,
} from "@sheetcraft/core/shape-group";
import { canEditShapeObject } from "@sheetcraft/core/shape-protection";
import {
  normalizeShapeDrawingForest,
  isShapeGroupEligibleRoot,
} from "@sheetcraft/core/shape-group-planning";
import type { SheetDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  planShapeObjectControlAction,
  readShapeObjectControlPaths,
} from "./shape-object-control-planning";
import type {
  ShapeObjectControlAction,
  ShapeSelectionPaneRow,
} from "./shape-object-controls-contract";

type Node = SheetDrawing | ShapeGroupNode;
function nodeAt(forest: readonly SheetDrawing[], path: ShapeGroupPath): Node | undefined {
  const root = forest.find((node) => node.id === path[0]);
  return path.length === 1
    ? root
    : root && isShapeGroupDrawing(root)
      ? findShapeGroupNode(root, path)?.node
      : undefined;
}
function hasConnector(node: Node): boolean {
  return node.kind === "shapeGroup"
    ? node.members.some(hasConnector)
    : node.kind === "shape" && !!node.shapeConnector;
}
function canFlip(node: Node, reflectedMember = false): boolean {
  return node.kind === "shapeGroup"
    ? node.members.every((member) => canFlip(member, true))
    : (node.kind === "shape" || node.kind === "textBox") &&
        (!(node.kind === "shape" && node.shapeConnector) || reflectedMember);
}
function renamed(node: Node, path: ShapeGroupPath, depth: number, name: string): Node {
  if (node.id !== path[depth]) throw new TypeError("The object owner has changed.");
  if (depth === path.length - 1) return { ...node, name };
  if (node.kind !== "shapeGroup") throw new TypeError("Missing shape owner.");
  if (!node.members.some((child) => child.id === path[depth + 1]))
    throw new TypeError("Missing shape object.");
  return {
    ...node,
    members: node.members.map((child) =>
      child.id === path[depth + 1]
        ? (renamed(child, path, depth + 1, name) as ShapeGroupChild)
        : child,
    ),
  };
}

function visibilityChanged(node: Node, hidden: boolean): Node {
  if (node.kind !== "shape" && node.kind !== "textBox" && node.kind !== "shapeGroup")
    throw new TypeError("This object has no shape visibility state.");
  const { hidden: _hidden, ...source } = node;
  return hidden ? { ...source, hidden: true } : source;
}
function visibilityAt(node: Node, path: ShapeGroupPath, depth: number, hidden: boolean): Node {
  if (node.id !== path[depth]) throw new TypeError("The visibility owner has changed.");
  if (depth === path.length - 1) return visibilityChanged(node, hidden);
  if (node.kind !== "shapeGroup" || !node.members.some((child) => child.id === path[depth + 1]))
    throw new TypeError("Missing visibility owner.");
  return {
    ...node,
    members: node.members.map((child) =>
      child.id === path[depth + 1]
        ? (visibilityAt(child, path, depth + 1, hidden) as ShapeGroupChild)
        : child,
    ),
  };
}
function allVisibility(node: Node, hidden: boolean): Node {
  const next = visibilityChanged(node, hidden);
  // Show All must also clear separately hidden descendants; Hide All needs only roots.
  return !hidden && next.kind === "shapeGroup"
    ? {
        ...next,
        members: next.members.map((child) => allVisibility(child, false) as ShapeGroupChild),
      }
    : next;
}

/** Every rendered control keeps the exact forest, worksheet, selection and metrics lease. */
export function useShapeObjectControls(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getGeneration: () => number;
  getRevision: () => number;
  getMetrics: () => PictureSheetMetrics | undefined;
  getSelection: () => readonly ShapeGroupPath[];
  isBusy: () => boolean;
  flush: () => boolean;
  select: (paths: readonly ShapeGroupPath[]) => boolean;
  format: (path: ShapeGroupPath) => boolean;
  replaceVisibilityCollection: (
    next: readonly SheetDrawing[],
    expected: readonly SheetDrawing[],
    metrics: PictureSheetMetrics,
    guard: () => boolean,
  ) => boolean;
  replaceCollection: (
    next: readonly SheetDrawing[],
    expected: readonly SheetDrawing[],
    metrics: PictureSheetMetrics,
    guard: () => boolean,
  ) => boolean;
}) {
  const paneVisible = ref(false);
  const rowOwners = new WeakMap<object, string>();
  let nextRowOwner = 0;
  const rowOwner = (node: Node) => {
    let key = rowOwners.get(node);
    if (!key) {
      key = String(++nextRowOwner);
      rowOwners.set(node, key);
    }
    return key;
  };
  const snapshot = computed(() => {
    try {
      const workbook = options.getWorkbook(),
        sheet = options.getSheet(),
        metrics = options.getMetrics(),
        generation = options.getGeneration(),
        revision = options.getRevision(),
        expected = sheet.drawings ?? [],
        source = JSON.stringify(expected),
        paths = readShapeObjectControlPaths(options.getSelection()),
        selection = JSON.stringify(paths),
        protection = JSON.stringify([sheet.properties.protected, sheet.protection?.editObjects]);
      if (!metrics || workbook.sheets.get(sheet.id) !== sheet) return;
      // Reject malformed forests; listing never silently replaces stored objects.
      normalizeShapeDrawingForest(expected);
      if (
        paths.some((path) => {
          const node = nodeAt(expected, path);
          return !node || !isShapeGroupEligibleRoot(node as SheetDrawing);
        })
      )
        return;
      const targets = paths.map((path) => nodeAt(expected, path)!);
      const editable =
        !options.isBusy() &&
        paths.every((path) =>
          canEditShapeObject(
            sheet,
            expected.find((root) => root.id === path[0])!,
          ),
        );
      const rows: ShapeSelectionPaneRow[] = [];
      const selectedPaths = new Set(paths.map((path) => JSON.stringify(path)));
      const visit = (
        node: Node,
        path: string[],
        depth: number,
        root: SheetDrawing,
        inheritedHidden = false,
      ) => {
        if (!isShapeGroupEligibleRoot(node as SheetDrawing)) return;
        rows.push(
          Object.freeze({
            path: Object.freeze(path),
            name: node.name,
            kind: node.kind as ShapeSelectionPaneRow["kind"],
            depth,
            selected: selectedPaths.has(JSON.stringify(path)),
            canEdit: !options.isBusy() && canEditShapeObject(sheet, root),
            visible: !inheritedHidden && !("hidden" in node && node.hidden === true),
            hiddenByAncestor: inheritedHidden,
            canToggleVisibility:
              !inheritedHidden && !options.isBusy() && canEditShapeObject(sheet, root),
            sourceKey: rowOwner(node),
          }),
        );
        if (node.kind === "shapeGroup")
          for (const child of [...node.members].reverse())
            visit(
              child,
              [...path, child.id],
              depth + 1,
              root,
              inheritedHidden || node.hidden === true,
            );
      };
      for (const root of [...expected].reverse()) visit(root, [root.id], 0, root);
      const current = () =>
        !options.isBusy() &&
        options.getWorkbook() === workbook &&
        options.getSheet() === sheet &&
        workbook.sheets.get(sheet.id) === sheet &&
        options.getGeneration() === generation &&
        options.getRevision() === revision &&
        options.getMetrics() === metrics &&
        (sheet.drawings ?? []).length === expected.length &&
        (sheet.drawings ?? []).every((node, index) => node === expected[index]) &&
        JSON.stringify(sheet.drawings ?? []) === source &&
        JSON.stringify(options.getSelection()) === selection &&
        JSON.stringify([sheet.properties.protected, sheet.protection?.editObjects]) === protection;
      const prepare = () => current() && options.flush() && current();
      const apply = (action: ShapeObjectControlAction) => {
        if (!editable || !paths.length || !prepare()) return false;
        try {
          return options.replaceCollection(
            planShapeObjectControlAction(expected, paths, action, metrics),
            expected,
            metrics,
            current,
          );
        } catch {
          return false;
        }
      };
      const rootSelection = paths.every((path) => path.length === 1);
      const sameParent = paths.every(
        (path) => JSON.stringify(path.slice(0, -1)) === JSON.stringify(paths[0]?.slice(0, -1)),
      );
      const formatAvailable =
        editable &&
        targets.length === 1 &&
        isShapeObjectPathVisible(
          expected.find((node) => node.id === paths[0]?.[0])!,
          paths[0]!,
        ) &&
        ((targets[0]?.kind === "shape" && !!targets[0].shapeConnector) ||
          !hasConnector(expected.find((node) => node.id === paths[0]?.[0])!));
      return Object.freeze({
        ownerKey: JSON.stringify([sheet.id, generation, revision, paths]),
        draftOwnerKey: JSON.stringify([sheet.id, generation]),
        rows: Object.freeze(rows),
        paths: Object.freeze(paths.map((path) => Object.freeze(path))),
        disabled: !editable || !paths.length,
        canFlip: editable && !!targets.length && targets.every((node) => canFlip(node)),
        canRotate:
          editable &&
          !!targets.length &&
          targets.every((node) => !(node.kind === "shape" && node.shapeConnector)),
        canOrder: editable && !!targets.length && (rootSelection || sameParent),
        canFormat: formatAvailable,
        actionHandler: apply,
        formatHandler: () => formatAvailable && prepare() && options.format(paths[0]!),
        selectionPaneHandler: () => {
          if (!current()) return false;
          paneVisible.value = !paneVisible.value;
          return true;
        },
        closeHandler: () => {
          if (!current()) return false;
          paneVisible.value = false;
          return true;
        },
        selectHandler: (pathValue: ShapeGroupPath, additive: boolean) => {
          if (!prepare()) return false;
          try {
            const [path] = readShapeObjectControlPaths([pathValue]);
            if (!path || !nodeAt(expected, path)) return false;
            const root = expected.find((node) => node.id === path[0]);
            if (!root || !canEditShapeObject(sheet, root)) return false;
            const next =
              additive && path.length === 1 && rootSelection
                ? paths.some((selected) => selected[0] === path[0])
                  ? paths.filter((selected) => selected[0] !== path[0])
                  : [...paths, path]
                : [path];
            return options.select(next);
          } catch {
            return false;
          }
        },
        visibilityHandler: (pathValue: ShapeGroupPath, hidden: boolean) => {
          if (typeof hidden !== "boolean" || !prepare()) return false;
          try {
            const [path] = readShapeObjectControlPaths([pathValue]);
            const row = rows.find((row) => JSON.stringify(row.path) === JSON.stringify(path));
            const root = expected.find((node) => node.id === path?.[0]);
            if (!path || !root || !row?.canToggleVisibility || !canEditShapeObject(sheet, root))
              return false;
            return options.replaceVisibilityCollection(
              expected.map((node) =>
                node === root ? (visibilityAt(root, path, 0, hidden) as SheetDrawing) : node,
              ),
              expected,
              metrics,
              current,
            );
          } catch {
            return false;
          }
        },
        canToggleAllVisibility:
          !options.isBusy() && rows.length > 0 && rows.every((row) => row.canEdit),
        allVisibilityHandler: (hidden: boolean) => {
          if (
            typeof hidden !== "boolean" ||
            !rows.length ||
            !rows.every((row) => row.canEdit) ||
            !prepare()
          )
            return false;
          try {
            return options.replaceVisibilityCollection(
              expected.map((node) =>
                isShapeGroupEligibleRoot(node)
                  ? (allVisibility(node, hidden) as SheetDrawing)
                  : node,
              ),
              expected,
              metrics,
              current,
            );
          } catch {
            return false;
          }
        },
        renameHandler: (pathValue: ShapeGroupPath, name: string) => {
          if (typeof name !== "string" || !name.trim() || name.length > 200 || !prepare())
            return false;
          try {
            const [path] = readShapeObjectControlPaths([pathValue]);
            if (!path) return false;
            const root = expected.find((node) => node.id === path[0]);
            if (!root || !nodeAt(expected, path) || !canEditShapeObject(sheet, root)) return false;
            return options.replaceCollection(
              expected.map((node) =>
                node === root ? (renamed(root, path, 0, name) as SheetDrawing) : node,
              ),
              expected,
              metrics,
              current,
            );
          } catch {
            return false;
          }
        },
      });
    } catch {
      return;
    }
  });
  return { snapshot, paneVisible };
}
