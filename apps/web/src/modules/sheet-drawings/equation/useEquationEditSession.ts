import { computed, onScopeDispose, shallowRef, watch } from "vue";
import {
  cloneEquationDocument,
  serializeEquationDocument,
  type EquationDocument,
  findEquationNode,
} from "@sheetcraft/core/equation-document";
import { createSetSheetDrawingsCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import {
  isFramedEquationDrawing,
  normalizeSheetDrawing,
  type SheetDrawing,
  type SheetFramedEquationDrawing,
  type SheetGraphicDrawing,
} from "@sheetcraft/core/sheet-drawings";
import {
  findShapeGroupNode,
  isShapeGroupDrawing,
  isSheetGroupedEquationDrawing,
  normalizeShapeGroupChild,
  type ShapeGroupDrawing,
  type ShapeGroupPath,
  type SheetGroupedEquationDrawing,
} from "@sheetcraft/core/shape-group";
import {
  applyShapeGroupEquationSourceEdit,
  leaseShapeGroupNode,
  type ShapeGroupNodeLease,
} from "@sheetcraft/core/shape-group-edit";
import {
  resolveShapeGroup,
  type ResolvedShapeGroupNode,
} from "@sheetcraft/core/shape-group-layout";
import { locatePictureAxisPoint } from "@sheetcraft/core/picture-axis-metrics";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { canEditShapeObject } from "@sheetcraft/core/shape-protection";
import type { CellAddress, Sheet, Workbook } from "@sheetcraft/core/workbook";
import { createGraphicDrawing } from "../drawing-defaults";
import { createBrowserIdFactory } from "../../../shared/runtime/browser-id-factory";
import {
  createEquationDraft,
  EquationDraftHistory,
  nextEquationSlot,
  equationStructureAtSelection,
  equationSlotText,
  type EquationDraftAction,
  type EquationDraftSnapshot,
  type EquationSelection,
} from "./equation-draft";
import { renderEquationSource } from "./equation-render";
import { resolveShapeDrawing } from "../resolved-shape-drawing";

export type EquationRootEditSource = SheetGraphicDrawing | SheetFramedEquationDrawing;
export type EquationEditSource = EquationRootEditSource | SheetGroupedEquationDrawing;

export type EquationEditSnapshot = {
  sessionId: number;
  ownerId: string;
  /** Exact persisted mathematical node; a disposable world view never owns source. */
  source: EquationEditSource;
  /** The actual worksheet owner, including an outer group for an owned Equation. */
  root: SheetDrawing;
  /** Exact root-to-mathematical-node path, absent for worksheet-level Equations. */
  path?: ShapeGroupPath;
  view: SheetGraphicDrawing;
  mode: "structured" | "latex";
  draft?: EquationDraftSnapshot;
  sourceText: string;
  composing: boolean;
  sourceWarning: boolean;
  normalText: boolean;
  error?: string;
};
export type EquationEditCallbacks = {
  isActive: () => boolean;
  action: (action: EquationDraftAction) => boolean;
  select: (selection: EquationSelection) => boolean;
  composition: (composing: boolean) => boolean;
  history: (direction: "undo" | "redo") => boolean;
  nextSlot: (direction: "forward" | "backward") => boolean;
  source: (text: string) => boolean;
  toggleNormalText: () => boolean;
  format: (field: "fontSize" | "color", value: number | string) => boolean;
  sourceMode: () => boolean;
  confirmSourceMode: () => boolean;
  dismissSourceWarning: () => void;
  reloadStructured: () => boolean;
  commit: () => boolean;
  cancel: () => void;
};

function drawingKey(value: SheetDrawing | SheetGroupedEquationDrawing): string | undefined {
  try {
    return JSON.stringify(
      isSheetGroupedEquationDrawing(value)
        ? normalizeShapeGroupChild(value)
        : normalizeSheetDrawing(value),
    );
  } catch {
    return undefined;
  }
}
function metricIdentity(metrics: PictureSheetMetrics | undefined): readonly unknown[] {
  if (!metrics) return [];
  return [metrics.columns, metrics.rows].flatMap((axis) => [
    axis,
    axis.count,
    axis.nominalSize,
    axis.visibleSize,
    axis.nominalPrefix,
    axis.visiblePrefix,
  ]);
}
/** Mathematical draft ownership is independent of cell editing and shape text runs. */
export function useEquationEditSession(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getGeneration: () => number;
  getRevision: () => number;
  getAddress: () => CellAddress;
  getMetrics?: () => PictureSheetMetrics | undefined;
  isBusy: () => boolean;
  flush: () => boolean;
  execute: (command: WorkbookCommand) => unknown;
  name: () => string;
  /** Hosts with a rendered geometry provider open after it consumes the new revision. */
  openInserted?: (source: EquationRootEditSource) => boolean;
}) {
  const snapshot = shallowRef<EquationEditSnapshot>();
  const callbacks = shallowRef<EquationEditCallbacks>();
  const idFactory = createBrowserIdFactory();
  const createId = () => idFactory("equation");
  let sequence = 0,
    applying = false,
    disposed = false;
  const selectedStructure = computed(() => {
    const state = snapshot.value;
    return (
      state?.draft && equationStructureAtSelection(state.draft.document, state.draft.selection)
    );
  });
  function begin(source: EquationRootEditSource): boolean {
    return beginSession(source);
  }
  function beginOwned(root: ShapeGroupDrawing, path: ShapeGroupPath): boolean {
    return beginSession(root, [...path]);
  }
  function beginSession(root: SheetDrawing, path?: ShapeGroupPath): boolean {
    const initialSheet = options.getSheet();
    const readSource = (owner: SheetDrawing): EquationEditSource | undefined => {
      try {
        if (path) {
          if (!isShapeGroupDrawing(owner) || path.length < 2) return undefined;
          const node = findShapeGroupNode(owner, path)?.node;
          return isSheetGroupedEquationDrawing(node) ? node : undefined;
        }
        return owner.kind === "equation" ? owner : undefined;
      } catch {
        return undefined;
      }
    };
    const initialSource = readSource(root);
    if (
      disposed ||
      !initialSource ||
      options.isBusy() ||
      !initialSheet.drawings?.includes(root) ||
      !canEditShapeObject(initialSheet, root)
    )
      return false;
    const current = snapshot.value;
    if (
      current?.root === root &&
      current.source === initialSource &&
      JSON.stringify(current.path) === JSON.stringify(path) &&
      callbacks.value?.isActive()
    )
      return true;
    const priorRoot = drawingKey(root);
    if (!priorRoot || !options.flush()) return false;
    const sheet = options.getSheet(),
      workbook = options.getWorkbook(),
      generation = options.getGeneration(),
      revision = options.getRevision();
    const currentRoot = sheet.drawings?.find((drawing) => drawing.id === root.id);
    if (
      sheet !== initialSheet ||
      !currentRoot ||
      drawingKey(currentRoot) !== priorRoot ||
      !canEditShapeObject(sheet, currentRoot)
    )
      return false;
    root = currentRoot;
    const source = readSource(root);
    if (!source) return false;
    const fingerprint = drawingKey(root);
    const metrics = options.getMetrics?.();
    const metricLease = metricIdentity(metrics);
    let lease: ShapeGroupNodeLease | undefined;
    let view: SheetGraphicDrawing;
    try {
      if (path) {
        if (!isShapeGroupDrawing(root) || !metrics || !isSheetGroupedEquationDrawing(source))
          return false;
        // Hidden state and edit permission follow the real outer owner and all
        // intermediate containers. No synthetic leaf becomes a worksheet root.
        for (let length = 1; length <= path.length; length++)
          if (findShapeGroupNode(root, path.slice(0, length))?.node.hidden) return false;
        const resolved = resolveShapeGroup(root, metrics);
        const findResolved = (node: ResolvedShapeGroupNode): ResolvedShapeGroupNode | undefined => {
          if (
            node.path.length === path.length &&
            node.path.every((id, index) => id === path[index])
          )
            return node;
          if ("members" in node)
            for (const member of node.members) {
              const found = findResolved(member);
              if (found) return found;
            }
          return undefined;
        };
        const target = findResolved(resolved);
        if (!target?.visible || !target.layout || target.layout.collapsed) return false;
        lease = leaseShapeGroupNode(root, path);
        const {
          groupFrame: _frame,
          shapeProperties: _properties,
          ...appearance
        } = normalizeShapeGroupChild(source) as SheetGroupedEquationDrawing;
        const { rect, angleDeg } = target.layout;
        const column = locatePictureAxisPoint(rect.x, metrics.columns),
          row = locatePictureAxisPoint(rect.y, metrics.rows);
        view = {
          ...appearance,
          rotation: angleDeg,
          anchor: { column: column.index, row: row.index },
          offsetX: rect.x - metrics.columns.visiblePrefix(column.index),
          offsetY: rect.y - metrics.rows.visiblePrefix(row.index),
          width: rect.width,
          height: rect.height,
        };
      } else if (!isSheetGroupedEquationDrawing(source) && isFramedEquationDrawing(source)) {
        if (!metrics) return false;
        view = resolveShapeDrawing(source, metrics).view as SheetGraphicDrawing;
      } else view = normalizeSheetDrawing(source as EquationRootEditSource) as SheetGraphicDrawing;
    } catch {
      return false;
    }
    const sourceOwners =
      path && isShapeGroupDrawing(root)
        ? path
            .slice(0, -1)
            .map(
              (_, index) =>
                findShapeGroupNode(root as ShapeGroupDrawing, path.slice(0, index + 1))?.node,
            )
        : undefined;
    const history = source.equationDocument
      ? new EquationDraftHistory(createEquationDraft(source.equationDocument))
      : undefined;
    const sourceHistory = [source.text];
    let sourcePosition = 0;
    let typingMode: "math" | "normal" | undefined;
    const state: EquationEditSnapshot = {
      sessionId: ++sequence,
      ownerId: source.id,
      source,
      root,
      ...(path ? { path: [...path] } : {}),
      view,
      mode: history ? "structured" : "latex",
      draft: history?.current,
      sourceText: source.text,
      composing: false,
      sourceWarning: false,
      normalText: false,
    };
    const owned = () =>
      !disposed &&
      snapshot.value?.sessionId === state.sessionId &&
      options.getWorkbook() === workbook &&
      options.getSheet() === sheet &&
      options.getGeneration() === generation &&
      options.getRevision() === revision &&
      workbook.sheets.get(sheet.id) === sheet &&
      sheet.drawings?.includes(root) === true &&
      readSource(root) === source &&
      (!sourceOwners ||
        (isShapeGroupDrawing(root) &&
          sourceOwners.every(
            (owner, index) =>
              findShapeGroupNode(root as ShapeGroupDrawing, path!.slice(0, index + 1))?.node ===
              owner,
          ))) &&
      drawingKey(root) === fingerprint &&
      options.getMetrics?.() === metrics &&
      metricLease.every((entry, index) => entry === metricIdentity(metrics)[index]) &&
      canEditShapeObject(sheet, root);
    const editable = () => owned() && !options.isBusy();
    const publish = () => {
      snapshot.value = { ...state };
    };
    const fail = (message: string) => {
      if (owned()) {
        state.error = message;
        publish();
      }
      return false;
    };
    const updateTree = (next: EquationDraftSnapshot | null): boolean => {
      if (!next) return fail("This structure change could not be applied.");
      state.draft = next;
      const document = cloneEquationDocument(next.document),
        text = serializeEquationDocument(document);
      state.view = { ...state.view, text, equationDocument: document };
      state.sourceText = text;
      state.error = undefined;
      publish();
      return true;
    };
    const captured: EquationEditCallbacks = {
      isActive: owned,
      action(action) {
        if (!editable() || state.mode !== "structured" || state.composing || !history) return false;
        return updateTree(
          history.apply(
            action.type === "replace-text" && typingMode !== undefined
              ? { ...action, mode: typingMode }
              : action,
          ),
        );
      },
      select(selection) {
        if (!editable() || state.mode !== "structured" || state.composing || !history) return false;
        return updateTree(history.select(selection));
      },
      composition(composing) {
        if (composing ? !editable() : !owned()) return false;
        state.composing = composing;
        publish();
        return true;
      },
      history(direction) {
        if (!editable() || state.composing) return false;
        if (state.mode === "structured" && history)
          return updateTree(direction === "undo" ? history.undo() : history.redo());
        const next = sourcePosition + (direction === "undo" ? -1 : 1);
        if (next < 0 || next >= sourceHistory.length) return false;
        sourcePosition = next;
        state.sourceText = sourceHistory[next]!;
        state.view = { ...state.view, text: state.sourceText };
        state.error = undefined;
        publish();
        return true;
      },
      nextSlot(direction) {
        if (!editable() || state.composing || !state.draft || !history) return false;
        return updateTree(history.select(nextEquationSlot(state.draft, direction)));
      },
      toggleNormalText() {
        if (
          !editable() ||
          state.composing ||
          state.mode !== "structured" ||
          !state.draft ||
          !history
        )
          return false;
        const range = state.draft.selection,
          slot = findEquationNode(state.draft.document, range.slotId);
        if (slot?.kind !== "sequence") return false;
        const text = equationSlotText(slot).slice(range.start, range.end);
        if (text.includes("\ufffc")) return false;
        const normal = !state.normalText;
        if (
          range.start !== range.end &&
          !updateTree(
            history.apply({
              type: "replace-text",
              selection: range,
              text,
              mode: normal ? "normal" : "math",
            }),
          )
        )
          return false;
        typingMode = normal ? "normal" : "math";
        state.normalText = normal;
        publish();
        return true;
      },
      source(text) {
        if (!editable() || state.composing || state.mode !== "latex" || text.length > 100000)
          return false;
        if (text !== state.sourceText) {
          sourceHistory.splice(sourcePosition + 1);
          sourceHistory.push(text);
          if (sourceHistory.length > 100) sourceHistory.shift();
          sourcePosition = sourceHistory.length - 1;
        }
        state.sourceText = text;
        state.view = { ...state.view, text };
        state.error = undefined;
        publish();
        return true;
      },
      format(field, value) {
        if (!editable() || state.composing) return false;
        if (
          field === "fontSize" &&
          (typeof value !== "number" || !Number.isFinite(value) || value < 1 || value > 512)
        )
          return false;
        if (field === "color" && (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)))
          return false;
        state.view = { ...state.view, [field]: value };
        publish();
        return true;
      },
      sourceMode() {
        if (!editable() || state.composing) return false;
        if (state.mode === "latex") return true;
        state.sourceWarning = true;
        publish();
        return true;
      },
      dismissSourceWarning() {
        if (owned()) {
          state.sourceWarning = false;
          publish();
        }
      },
      confirmSourceMode() {
        if (!editable() || state.composing || !state.sourceWarning) return false;
        state.mode = "latex";
        state.sourceWarning = false;
        const { equationDocument: _document, ...view } = state.view;
        state.view = view;
        sourceHistory.splice(0, sourceHistory.length, state.sourceText);
        sourcePosition = 0;
        publish();
        return true;
      },
      reloadStructured() {
        if (!editable() || state.composing || !history) return false;
        state.mode = "structured";
        state.sourceWarning = false;
        return updateTree(history.current);
      },
      commit() {
        if (!editable() || state.composing) return false;
        let next: SheetDrawing;
        try {
          if (path && lease && isShapeGroupDrawing(root)) {
            next = applyShapeGroupEquationSourceEdit(root, lease, {
              text: state.view.text,
              fontSize: state.view.fontSize,
              color: state.view.color,
              bold: state.view.bold,
              italic: state.view.italic,
              ...(state.view.equationDocument
                ? { equationDocument: state.view.equationDocument }
                : {}),
            });
          } else if (!isSheetGroupedEquationDrawing(source) && isFramedEquationDrawing(source)) {
            // Only deliberate mathematical content/typography edits cross the
            // source boundary. Keep canonical placement, visibility and permissions.
            const { equationDocument: _previousDocument, ...base } = source;
            next = normalizeSheetDrawing({
              ...base,
              text: state.view.text,
              fontSize: state.view.fontSize,
              color: state.view.color,
              bold: state.view.bold,
              italic: state.view.italic,
              ...(state.view.equationDocument
                ? { equationDocument: state.view.equationDocument }
                : {}),
            });
          } else next = normalizeSheetDrawing(state.view) as SheetGraphicDrawing;
        } catch {
          return fail("This equation source or appearance is invalid.");
        }
        if (drawingKey(next) === fingerprint) {
          captured.cancel();
          return true;
        }
        const rendered = renderEquationSource(state.view.text);
        if (rendered.status !== "ready") return fail(rendered.message);
        const expected = sheet.drawings!,
          proposed = expected.map((drawing) => (drawing === root ? next : drawing));
        if (!editable()) return false;
        let command: ReturnType<typeof createSetSheetDrawingsCommand>;
        try {
          command = createSetSheetDrawingsCommand(sheet.id, proposed);
        } catch {
          return fail("This equation source or appearance is invalid.");
        }
        applying = true;
        try {
          try {
            options.execute(command);
          } catch {
            /* Check the real applied result below. */
          }
          const applied =
            options.getWorkbook() === workbook &&
            options.getGeneration() === generation &&
            workbook.sheets.get(sheet.id) === sheet &&
            JSON.stringify(sheet.drawings) === JSON.stringify(command.drawings);
          if (!applied) return fail("The equation was not applied. Your draft is preserved.");
          if (snapshot.value?.sessionId === state.sessionId) {
            snapshot.value = undefined;
            callbacks.value = undefined;
          }
          return true;
        } finally {
          applying = false;
        }
      },
      cancel() {
        if (snapshot.value?.sessionId === state.sessionId) {
          snapshot.value = undefined;
          callbacks.value = undefined;
        }
      },
    };
    snapshot.value = state;
    callbacks.value = captured;
    return true;
  }
  function insert(textDocument: EquationDocument): boolean {
    if (disposed || options.isBusy() || !options.flush()) return false;
    const sheet = options.getSheet(),
      workbook = options.getWorkbook(),
      generation = options.getGeneration();
    const normalized = cloneEquationDocument(textDocument);
    const next: SheetGraphicDrawing = {
      ...createGraphicDrawing(createId(), "equation", options.name(), options.getAddress()),
      text: serializeEquationDocument(normalized),
      equationDocument: normalized,
      fontSize: (11 * 96) / 72,
      color: "#000000",
      bold: false,
      italic: true,
    };
    if (!canEditShapeObject(sheet, next) || renderEquationSource(next.text).status !== "ready")
      return false;
    const command = createSetSheetDrawingsCommand(sheet.id, [...(sheet.drawings ?? []), next]);
    applying = true;
    try {
      try {
        options.execute(command);
      } catch {
        /* Preserve ownership if observers throw after success. */
      }
      const created = sheet.drawings?.find((drawing) => drawing.id === next.id);
      if (
        options.getWorkbook() !== workbook ||
        options.getSheet() !== sheet ||
        options.getGeneration() !== generation ||
        created?.kind !== "equation" ||
        drawingKey(created) !== drawingKey(next)
      )
        return false;
      return options.openInserted ? options.openInserted(created) : begin(created);
    } finally {
      applying = false;
    }
  }
  watch(
    () => [
      options.getWorkbook(),
      options.getSheet(),
      options.getGeneration(),
      options.getRevision(),
      options.getSheet().drawings,
      options.getSheet().properties.protected,
      options.getSheet().protection,
      options.getMetrics?.(),
    ],
    () => {
      if (!applying && snapshot.value && !callbacks.value?.isActive()) callbacks.value?.cancel();
    },
    { flush: "sync" },
  );
  onScopeDispose(() => {
    disposed = true;
    callbacks.value?.cancel();
  });
  return { snapshot, callbacks, selectedStructure, begin, beginOwned, insert, createId };
}
