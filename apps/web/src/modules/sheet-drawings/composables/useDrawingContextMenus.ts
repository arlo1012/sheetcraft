import { computed, nextTick, ref, shallowRef, watch, type ComputedRef, type Ref } from "vue";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import type { ShapeGroupDrawing, ShapeGroupPath } from "@sheetcraft/core/shape-group";
import { canEditShapeObject } from "@sheetcraft/core/shape-protection";
import type {
  SheetDrawing as SourceSheetDrawing,
  SheetLegacyDrawing as SheetDrawing,
} from "@sheetcraft/core/sheet-drawings";
import type { Sheet } from "@sheetcraft/core/workbook";
import type { FloatingReference } from "../../../shared/floating/useFloatingPanel";
import type MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { createContextMenuPoint, useContextMenu } from "../../../shared/menu/useContextMenu";
import type { ResolvedShapeGroupLeaf } from "../resolved-shape-group";
import type { ResolvedShapeRenderLeaf } from "../resolved-shape-render-source";
import { getDrawingShapeTextRect } from "../shape-text-runtime";

export type DrawingContextMenuFragment = {
  drawing: SheetDrawing;
};

export type ShapeTextContextMenuState = {
  key: string;
  canText: boolean;
  kind: "shape" | "textBox" | "shapeGroup" | "chart" | "control";
  canObject: boolean;
  actions: {
    object: () => boolean;
    text: () => boolean;
    format: () => boolean;
    points?: () => boolean;
    copy?: () => boolean;
    cut?: () => boolean;
    paste?: () => boolean;
    reference?: () => boolean;
  };
};

type DrawingContextMenusOptions<TFragment extends DrawingContextMenuFragment> = {
  getDrawings: () => readonly SourceSheetDrawing[];
  getSheet: () => Sheet | undefined;
  getRevision: () => number | undefined;
  isReadOnly: () => boolean;
  metrics: ComputedRef<PictureSheetMetrics | undefined>;
  selectionKey: ComputedRef<string>;
  selectedRoots: Ref<string[]>;
  selectedOwnedId: Ref<string | null>;
  selectionFailure: Ref<boolean>;
  pointEditingId: Ref<string | null>;
  activeVertex: Ref<number>;
  legacyDrawings: ComputedRef<readonly SheetDrawing[]>;
  getCopyObjects: () => ((paths: readonly ShapeGroupPath[]) => boolean) | undefined;
  getCutObjects: () => ((paths: readonly ShapeGroupPath[]) => boolean) | undefined;
  getPasteObjects: () => (() => boolean) | undefined;
  canPasteObjects: () => boolean;
  hasStartTextEdit: () => boolean;
  getOpenTextBoxReference: () =>
    | ((root: SourceSheetDrawing, path?: ShapeGroupPath) => boolean)
    | undefined;
  selectRoots: (ids: string[], owned?: string | null, explicit?: boolean) => void;
  objectSelectionPaths: () => ShapeGroupPath[];
  sourceOwner: (drawing: SheetDrawing) => SourceSheetDrawing | undefined;
  resolvedOwner: (drawing: SheetDrawing) => { groupLeaf?: ResolvedShapeGroupLeaf } | undefined;
  projectionById: (drawing: SheetDrawing) => { renderLeaf?: ResolvedShapeRenderLeaf } | undefined;
  canChange: (drawing: SheetDrawing) => boolean;
  hits: (fragment: TFragment, event: MouseEvent) => boolean;
  finishCanvasText: () => boolean;
  beginCanvasText: (drawing: SheetDrawing, selection: "all" | "end") => boolean;
  formatConnector: (drawing: SheetDrawing) => boolean;
  formatGroup: (root: ShapeGroupDrawing, path: ShapeGroupPath) => void;
  pointContext: (fragment: TFragment, event: MouseEvent) => void;
  onEdit: (drawing: SourceSheetDrawing) => void;
  onEditOwned: (root: ShapeGroupDrawing, path: ShapeGroupPath) => void;
  onFormat: (drawing: Extract<SourceSheetDrawing, { kind: "shape" | "textBox" }>) => void;
  onFormatGroup: (root: ShapeGroupDrawing, path: ShapeGroupPath) => void;
  onSelect: () => void;
};

/** Owns shape, group, chart, and control context menu state and actions for SheetDrawingLayer. */
export function useDrawingContextMenus<TFragment extends DrawingContextMenuFragment>(
  options: DrawingContextMenusOptions<TFragment>,
) {
  const shapeTextMenu = shallowRef<ShapeTextContextMenuState>();
  const shapeTextMenuAnchor = shallowRef<FloatingReference | null>(null);
  const shapeTextMenuTrigger = shallowRef<HTMLElement | null>(null);
  const shapeTextMenuSurface = ref<InstanceType<typeof MenuSurface> | null>(null);
  const { floatingStyles: shapeTextMenuStyles, dismiss: dismissShapeTextMenu } = useContextMenu({
    anchor: shapeTextMenuAnchor,
    panelRef: computed(() => shapeTextMenuSurface.value?.rootElement ?? null),
    surfaceRef: shapeTextMenuSurface,
    open: computed(() => !!shapeTextMenu.value),
    restoreFocusTarget: () => shapeTextMenuTrigger.value,
    onDismiss: ({ restoreFocus }) => {
      const trigger = shapeTextMenuTrigger.value;
      shapeTextMenu.value = undefined;
      shapeTextMenuTrigger.value = null;
      if (restoreFocus && trigger?.isConnected) {
        void nextTick(() => {
          if (!shapeTextMenu.value && trigger.isConnected) {
            trigger.focus({ preventScroll: true });
          }
        });
      }
    },
  });

  function clipboardMenuActions(paths: readonly ShapeGroupPath[], valid: () => boolean) {
    const copy = options.getCopyObjects();
    const cut = options.getCutObjects();
    const paste = options.getPasteObjects();
    const captured = paths.map((path) => [...path]);
    const run = (callback: (() => boolean) | undefined): boolean => {
      if (!valid() || !callback || !options.finishCanvasText() || !valid()) return false;
      const accepted = callback();
      if (accepted) dismissShapeTextMenu("programmatic", false);
      else options.selectionFailure.value = true;
      return accepted;
    };
    return {
      ...(copy
        ? { copy: () => copy === options.getCopyObjects() && run(() => copy(captured)) }
        : {}),
      ...(cut ? { cut: () => cut === options.getCutObjects() && run(() => cut(captured)) } : {}),
      ...(paste
        ? {
            paste: () =>
              paste === options.getPasteObjects() && options.canPasteObjects() && run(paste),
          }
        : {}),
    };
  }

  function groupClipboardContext(
    root: ShapeGroupDrawing,
    path: ShapeGroupPath,
    event: MouseEvent,
  ): void {
    const sheet = options.getSheet();
    if (
      !options.getDrawings().includes(root) ||
      !sheet ||
      !canEditShapeObject(sheet, root) ||
      options.isReadOnly()
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    options.selectRoots([root.id], path.length > 1 ? path.at(-1)! : null);
    const key = options.selectionKey.value;
    const m = options.metrics.value;
    const rev = options.getRevision();
    const menu: ShapeTextContextMenuState = {
      key,
      kind: "shapeGroup",
      canObject: false,
      canText: false,
      actions: {
        object: () => false,
        text: () => false,
        format: () => {
          if (!valid()) return false;
          options.formatGroup(root, path);
          dismissShapeTextMenu("programmatic", false);
          return true;
        },
        ...clipboardMenuActions([path], valid),
      },
    };
    function valid(): boolean {
      const currentSheet = options.getSheet();
      return (
        shapeTextMenu.value === menu &&
        key === options.selectionKey.value &&
        options.metrics.value === m &&
        options.getRevision() === rev &&
        options.getDrawings().includes(root) &&
        !options.isReadOnly() &&
        !!currentSheet &&
        canEditShapeObject(currentSheet, root)
      );
    }
    shapeTextMenuTrigger.value =
      event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    shapeTextMenuAnchor.value = createContextMenuPoint(
      event,
      event.currentTarget as Element | null,
    );
    shapeTextMenu.value = menu;
  }

  function widgetClipboardContext(fragment: TFragment, event: MouseEvent | KeyboardEvent): void {
    const drawing = fragment.drawing;
    const sheet = options.getSheet();
    const source = options.sourceOwner(drawing);
    if (
      (drawing.kind !== "chart" && drawing.kind !== "control") ||
      source?.kind !== drawing.kind ||
      !sheet ||
      !options.canChange(drawing) ||
      !options.getDrawings().includes(source) ||
      (event instanceof MouseEvent && !options.hits(fragment, event))
    )
      return;
    const capturedSource = source;
    event.preventDefault();
    event.stopPropagation();
    if (!options.selectedRoots.value.includes(source.id) || options.selectedOwnedId.value)
      options.selectRoots([source.id]);
    const paths = options.objectSelectionPaths();
    const key = options.selectionKey.value;
    const m = options.metrics.value;
    const rev = options.getRevision();
    const menu: ShapeTextContextMenuState = {
      key,
      kind: drawing.kind,
      canObject: false,
      canText: false,
      actions: {
        object: () => false,
        text: () => false,
        format: () => {
          if (capturedSource.kind !== "control" || !valid()) return false;
          dismissShapeTextMenu("programmatic", false);
          options.onEdit(capturedSource);
          return true;
        },
        ...clipboardMenuActions(paths, valid),
      },
    };
    function valid(): boolean {
      return (
        shapeTextMenu.value === menu &&
        key === options.selectionKey.value &&
        options.metrics.value === m &&
        options.getRevision() === rev &&
        options.getSheet() === sheet &&
        options.getDrawings().includes(capturedSource) &&
        options.sourceOwner(drawing) === capturedSource &&
        options.legacyDrawings.value.includes(drawing) &&
        options.canChange(drawing)
      );
    }
    shapeTextMenuTrigger.value =
      event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    shapeTextMenuAnchor.value =
      event instanceof MouseEvent
        ? createContextMenuPoint(event, event.currentTarget as Element | null)
        : event.currentTarget instanceof HTMLElement
          ? event.currentTarget
          : null;
    shapeTextMenu.value = menu;
  }

  function shapeContext(fragment: TFragment, event: MouseEvent | KeyboardEvent): void {
    const drawing = fragment.drawing;
    if (drawing.kind === "chart" || drawing.kind === "control") {
      widgetClipboardContext(fragment, event);
      return;
    }
    if (!options.hasStartTextEdit()) {
      if (event instanceof MouseEvent) options.pointContext(fragment, event);
      return;
    }
    if (
      (drawing.kind !== "shape" && drawing.kind !== "textBox") ||
      !options.canChange(drawing) ||
      options.legacyDrawings.value.find((item) => item.id === drawing.id) !== drawing ||
      (event instanceof MouseEvent && !options.hits(fragment, event))
    )
      return;
    const source = options.sourceOwner(drawing);
    const owned = options.resolvedOwner(drawing)?.groupLeaf;
    if (!source) return;
    event.preventDefault();
    event.stopPropagation();
    if (
      !options.selectedRoots.value.includes(source.id) ||
      (options.selectedOwnedId.value && options.selectedOwnedId.value !== drawing.id)
    )
      options.selectRoots([source.id], owned ? drawing.id : null);
    const capturedPaths = options.objectSelectionPaths();
    const key = options.selectionKey.value;
    const m = options.metrics.value;
    const rev = options.getRevision();
    const textRect = getDrawingShapeTextRect(drawing);
    const openTextBoxReference = options.getOpenTextBoxReference();
    const menu: ShapeTextContextMenuState = {
      key,
      kind: drawing.kind,
      canObject: !options.projectionById(drawing)?.renderLeaf?.connector,
      canText:
        !options.projectionById(drawing)?.renderLeaf?.connector &&
        !(drawing.kind === "textBox" && drawing.textReference) &&
        !!textRect &&
        textRect.width > 0 &&
        textRect.height > 0,
      actions: {
        ...clipboardMenuActions(capturedPaths, valid),
        object: () => {
          if (!valid() || !menu.canObject || !options.finishCanvasText() || !valid()) return false;
          if (owned) options.onEditOwned(owned.sourceRoot, owned.path);
          else options.onEdit(source);
          dismissShapeTextMenu("programmatic", false);
          return true;
        },
        text: () => {
          if (!valid() || !options.beginCanvasText(drawing, "all")) return false;
          dismissShapeTextMenu("programmatic", false);
          return true;
        },
        format: () => {
          if (!valid()) return false;
          if (options.projectionById(drawing)?.renderLeaf?.connector) {
            if (!options.formatConnector(drawing)) return false;
          } else if (owned) options.onFormatGroup(owned.sourceRoot, owned.path);
          else if (source.kind === "shape" || source.kind === "textBox") options.onFormat(source);
          else return false;
          dismissShapeTextMenu("programmatic", false);
          return true;
        },
        ...(drawing.kind === "textBox" && openTextBoxReference
          ? {
              reference: () => {
                if (!valid() || !options.finishCanvasText() || !valid()) return false;
                const opened = options.getOpenTextBoxReference()?.(source, owned?.path) === true;
                if (opened) dismissShapeTextMenu("programmatic", false);
                return opened;
              },
            }
          : {}),
        ...(drawing.kind === "shape" && drawing.shapePath
          ? {
              points: () => {
                if (!valid()) return false;
                options.pointEditingId.value = drawing.id;
                options.activeVertex.value = 0;
                dismissShapeTextMenu("programmatic", false);
                options.onSelect();
                return true;
              },
            }
          : {}),
      },
    };
    function valid() {
      return (
        shapeTextMenu.value === menu &&
        key === options.selectionKey.value &&
        options.metrics.value === m &&
        options.getRevision() === rev &&
        options.canChange(drawing) &&
        options.legacyDrawings.value.includes(drawing) &&
        options.sourceOwner(drawing) === source
      );
    }
    shapeTextMenuTrigger.value =
      event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    shapeTextMenuAnchor.value =
      event instanceof MouseEvent
        ? createContextMenuPoint(event, event.currentTarget as Element | null)
        : event.currentTarget instanceof HTMLElement
          ? event.currentTarget
          : null;
    shapeTextMenu.value = menu;
  }

  watch(
    () => [
      options.getDrawings(),
      options.getSheet(),
      options.getRevision(),
      options.metrics.value,
      options.isReadOnly(),
    ],
    () => {
      shapeTextMenu.value = undefined;
    },
  );
  watch(options.selectionKey, (key) => {
    if (shapeTextMenu.value?.key !== key) shapeTextMenu.value = undefined;
  });

  return {
    shapeTextMenu,
    shapeTextMenuSurface,
    shapeTextMenuStyles,
    dismissShapeTextMenu,
    groupClipboardContext,
    shapeContext,
  };
}
