import { computed, ref, shallowRef, watch, type ComputedRef, type Ref } from "vue";
import {
  getCellHyperlink,
  type CellAddress,
  type CellNoteBox,
  type Sheet,
} from "@sheetcraft/core/workbook";
import type { Point } from "@sheetcraft/sheet-engine/geometry";
import { areCellAddressesEqual } from "@sheetcraft/sheet-engine/selection";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import type { HeaderInteractionState } from "../input/useHeaderInteraction";
import { getSurfaceCell, type SheetRenderFrame } from "../rendering/sheet-render-frame";
import type SheetNotePreviewType from "../components/SheetNotePreview.vue";
import type { FormulaReferenceEditor } from "../../../shared/formula-editing/formula-editor-contract";
import {
  clientPointToElementSurface,
  surfacePointToBody,
} from "../../../shared/sheet-input/surface-coordinates";

type ImageLayerSurfaceTarget = {
  handleSurfacePointerDown: (event: PointerEvent, point: Point) => boolean;
  getSurfaceCursor: (point: Point) => string | undefined;
  handleSurfaceContextMenu: (event: MouseEvent, point: Point) => boolean;
  handleSurfaceDoubleClick: (event: MouseEvent, point: Point) => boolean;
};

type HeaderInputController = {
  onPointerDown: (point: Point, event: PointerEvent, element: HTMLElement) => unknown;
  onPointerMove: (point: Point) => unknown;
  onPointerLeave: () => void;
  onContextMenu: (point: Point, event: MouseEvent, element: HTMLElement) => unknown;
  onKeyDown: (event: KeyboardEvent, element: HTMLElement) => boolean;
  focus: (target: undefined) => void;
};

type NoteDraftState = {
  address: CellAddress;
  text: string;
  author: string;
  box?: CellNoteBox;
};

type SheetGridSurfaceInteractionOptions = {
  getSheet: () => Sheet;
  getWorkbookRevision: () => number | undefined;
  rootRef: Ref<HTMLElement | null>;
  scale: ComputedRef<number>;
  rulerInset: ComputedRef<number>;
  renderFrame: ComputedRef<SheetRenderFrame>;
  layout: ComputedRef<SheetViewportLayout>;
  effectiveFreeze: ComputedRef<{ rows: number; columns: number }>;
  activeCell: ComputedRef<CellAddress>;
  headerState: Ref<HeaderInteractionState>;
  headerInput: HeaderInputController;
  getPageMarginDragCursor: () => string | undefined;
  getPageBreakDragCursor: () => string | undefined;
  startPageBreakDrag: (event: PointerEvent) => boolean;
  hoverPageBreakDrag: (event: PointerEvent) => void;
  clearPageBreakDragHover: () => void;
  getDimensionResizeAxis: () => "row" | "column" | undefined;
  isAxisMoveDragActive: () => boolean;
  getOwnedImageLayer: () => ImageLayerSurfaceTarget | undefined;
  getImageLayer: () => ImageLayerSurfaceTarget | undefined;
  isFormatPainterActive: () => boolean;
  getReferenceEditor: () => FormulaReferenceEditor | null;
  hasActiveShapeTextEdit: () => boolean;
  commitShapeTextEdit: () => boolean;
  flushPendingEquationEdit: () => boolean;
  onCellMouseDown: (address: CellAddress, event: MouseEvent) => void;
  onCellDoubleClick: (address: CellAddress, event: MouseEvent) => void;
  openCellContextMenu: (address: CellAddress, event: MouseEvent) => void;
  onEditorKeydown: (event: KeyboardEvent) => void;
  onOpenHyperlink: (address: CellAddress) => void;
  isNotePreviewDisabled: () => boolean;
  getShowActiveNote: () => boolean;
  getShowAllNotes: () => boolean;
  getHiddenNoteKeys: () => readonly string[];
  getNoteDraft: () => NoteDraftState | undefined;
  isEditing: () => boolean;
  isSelectionDragging: () => boolean;
  isFreezeDragging: () => boolean;
  hasContextMenuOpen: () => boolean;
  isTransparentColorActive: () => boolean;
  cancelTransparentColor: () => void;
  isPictureCropActive: () => boolean;
  finishPictureCrop: () => boolean;
  notePreviewRefs: Ref<(InstanceType<typeof SheetNotePreviewType> | null)[]>;
};

/** Owns canvas pointer/hover/hyperlink/note-preview interactions and outside-click dismissal for SheetGrid. */
export function useSheetGridSurfaceInteraction(options: SheetGridSurfaceInteractionOptions) {
  const imageHoverCursor = ref<string>();
  const hoveredHyperlink = shallowRef<{ address: CellAddress; title: string }>();
  const hoveredNoteAddress = shallowRef<CellAddress>();
  let notePreviewLeaveTimer: number | undefined;

  function cancelNotePreviewLeave(): void {
    if (notePreviewLeaveTimer === undefined) return;
    window.clearTimeout(notePreviewLeaveTimer);
    notePreviewLeaveTimer = undefined;
  }

  function scheduleNotePreviewLeave(): void {
    cancelNotePreviewLeave();
    notePreviewLeaveTimer = window.setTimeout(() => {
      hoveredNoteAddress.value = undefined;
      notePreviewLeaveTimer = undefined;
    }, 120);
  }

  const hyperlinkPointerGesture = shallowRef<{
    address: CellAddress;
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
  }>();

  const surfaceCursor = computed(() => {
    const marginCursor = options.getPageMarginDragCursor();
    if (marginCursor) return marginCursor;
    const breakCursor = options.getPageBreakDragCursor();
    if (breakCursor) return breakCursor;
    const hit = options.headerState.value.hovered;
    const resizeAxis = options.getDimensionResizeAxis();
    if (resizeAxis) return resizeAxis === "row" ? "row-resize" : "col-resize";
    if (options.isAxisMoveDragActive()) return "grabbing";
    if (hit?.action === "resize") return hit.axis === "row" ? "row-resize" : "col-resize";
    if (hit?.action === "grip") return "grab";
    return hit
      ? "pointer"
      : (imageHoverCursor.value ?? (hoveredHyperlink.value ? "pointer" : "cell"));
  });

  function surfacePoint(event: MouseEvent): Point {
    return clientPointToElementSurface(
      { x: event.clientX, y: event.clientY },
      options.rootRef.value!,
      options.scale.value,
    );
  }

  function toImagePoint(point: Point): Point {
    return surfacePointToBody(point, options.renderFrame.value.headerSize);
  }

  function imagePoint(event: MouseEvent): Point {
    return toImagePoint(surfacePoint(event));
  }

  function isRulerPoint(point: Point): boolean {
    const inset = options.rulerInset.value;
    return inset > 0 && (point.x < inset || point.y < inset);
  }

  function clearHyperlinkPointerGesture(): void {
    hyperlinkPointerGesture.value = undefined;
    window.removeEventListener("pointermove", onHyperlinkPointerMove);
    window.removeEventListener("pointerup", onHyperlinkPointerUp);
    window.removeEventListener("pointercancel", cancelHyperlinkPointerGesture);
  }

  function cancelHyperlinkPointerGesture(event?: PointerEvent): void {
    if (
      event &&
      hyperlinkPointerGesture.value &&
      event.pointerId !== hyperlinkPointerGesture.value.pointerId
    )
      return;
    clearHyperlinkPointerGesture();
  }

  function onHyperlinkPointerMove(event: PointerEvent): void {
    const gesture = hyperlinkPointerGesture.value;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) >= 3)
      gesture.moved = true;
  }

  function onHyperlinkPointerUp(event: PointerEvent): void {
    const gesture = hyperlinkPointerGesture.value;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    clearHyperlinkPointerGesture();
    const completedAddress = getSurfaceCell(options.renderFrame.value, surfacePoint(event));
    if (
      !gesture.moved &&
      completedAddress &&
      areCellAddressesEqual(gesture.address, completedAddress)
    ) {
      options.onOpenHyperlink(gesture.address);
    }
  }

  function onSurfacePointerDown(event: PointerEvent): void {
    if (!options.flushPendingEquationEdit()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (options.hasActiveShapeTextEdit() && !options.commitShapeTextEdit()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (options.startPageBreakDrag(event)) return;
    const point = surfacePoint(event);
    if (isRulerPoint(point)) return;
    if (options.headerInput.onPointerDown(point, event, event.currentTarget as HTMLElement)) return;
    const bodyPoint = toImagePoint(point);
    if (options.getOwnedImageLayer()?.handleSurfacePointerDown(event, bodyPoint)) return;
    if (options.getImageLayer()?.handleSurfacePointerDown(event, bodyPoint)) return;
    if (event.button !== 0) return;
    const address = getSurfaceCell(options.renderFrame.value, point);
    if (address) {
      options.headerInput.focus(undefined);
      event.preventDefault();
      const hyperlink = getCellHyperlink(options.getSheet(), address);
      if (
        hyperlink &&
        !event.shiftKey &&
        !options.isFormatPainterActive() &&
        !options.getReferenceEditor()
      ) {
        hyperlinkPointerGesture.value = {
          address,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          moved: false,
        };
        window.addEventListener("pointermove", onHyperlinkPointerMove);
        window.addEventListener("pointerup", onHyperlinkPointerUp);
        window.addEventListener("pointercancel", cancelHyperlinkPointerGesture);
      }
      options.onCellMouseDown(address, event);
    }
  }

  function onSurfacePointerMove(event: PointerEvent): void {
    cancelNotePreviewLeave();
    options.hoverPageBreakDrag(event);
    const point = surfacePoint(event);
    if (isRulerPoint(point)) {
      options.headerInput.onPointerLeave();
      return;
    }
    options.headerInput.onPointerMove(point);
    const bodyPoint = toImagePoint(point);
    imageHoverCursor.value =
      options.getOwnedImageLayer()?.getSurfaceCursor(bodyPoint) ??
      options.getImageLayer()?.getSurfaceCursor(bodyPoint);
    const address = getSurfaceCell(options.renderFrame.value, point);
    const sheet = options.getSheet();
    const hyperlink = address && getCellHyperlink(sheet, address);
    hoveredHyperlink.value = hyperlink
      ? { address, title: hyperlink.tooltip || hyperlink.target }
      : undefined;
    const noteAddress = address && options.layout.value.getAnchorForAddress(address);
    hoveredNoteAddress.value =
      noteAddress && sheet.cells.get(`${noteAddress.row}:${noteAddress.column}`)?.note
        ? noteAddress
        : undefined;
  }

  function onSurfacePointerLeave(): void {
    options.clearPageBreakDragHover();
    options.headerInput.onPointerLeave();
    imageHoverCursor.value = undefined;
    hoveredHyperlink.value = undefined;
    scheduleNotePreviewLeave();
  }

  function onSurfaceContextMenu(event: MouseEvent): void {
    const point = surfacePoint(event);
    if (isRulerPoint(point)) return;
    if (options.headerInput.onContextMenu(point, event, event.currentTarget as HTMLElement)) return;
    const bodyPoint = toImagePoint(point);
    if (options.getOwnedImageLayer()?.handleSurfaceContextMenu(event, bodyPoint)) return;
    if (options.getImageLayer()?.handleSurfaceContextMenu(event, bodyPoint)) return;
    const address = getSurfaceCell(options.renderFrame.value, point);
    if (address) options.openCellContextMenu(address, event);
  }

  function onSurfaceDoubleClick(event: MouseEvent): void {
    const point = surfacePoint(event);
    const bodyPoint = toImagePoint(point);
    if (options.getOwnedImageLayer()?.handleSurfaceDoubleClick(event, bodyPoint)) return;
    if (options.getImageLayer()?.handleSurfaceDoubleClick(event, bodyPoint)) return;
    const address = getSurfaceCell(options.renderFrame.value, point);
    if (address) {
      event.preventDefault();
      options.onCellDoubleClick(address, event);
    }
  }

  function onSurfaceKeydown(event: KeyboardEvent): void {
    if (!options.headerInput.onKeyDown(event, event.currentTarget as HTMLElement)) {
      options.onEditorKeydown(event);
    }
  }

  const notePreviewsSuppressed = computed(
    () =>
      options.isNotePreviewDisabled() ||
      options.isEditing() ||
      options.isSelectionDragging() ||
      options.isFreezeDragging() ||
      Boolean(options.getDimensionResizeAxis()) ||
      options.isAxisMoveDragActive() ||
      options.hasContextMenuOpen(),
  );

  function noteOrigin(address: CellAddress): Point | undefined {
    const rect = options.layout.value.getCellViewportRect(address);
    const root = options.rootRef.value;
    if (!root || !rect || rect.width === 0 || rect.height === 0) return;
    const { row, column } = address;
    const freeze = options.effectiveFreeze.value;
    const frame = options.renderFrame.value;
    const pane =
      row < freeze.rows
        ? column < freeze.columns
          ? frame.panes.topLeft
          : frame.panes.top
        : column < freeze.columns
          ? frame.panes.left
          : frame.panes.body;
    const left = Math.max(rect.x, pane.clip.x);
    const top = Math.max(rect.y, pane.clip.y);
    const right = Math.min(rect.x + rect.width, pane.clip.x + pane.clip.width);
    const bottom = Math.min(rect.y + rect.height, pane.clip.y + pane.clip.height);
    if (right <= left || bottom <= top) return;
    const bounds = root.getBoundingClientRect();
    return {
      x: bounds.left + (frame.body.x + right) * options.scale.value,
      y: bounds.top + (frame.body.y + top) * options.scale.value,
    };
  }

  const allNoteAddresses = computed(() => {
    void options.getWorkbookRevision();
    if (!options.getShowAllNotes()) return [];
    const hiddenNoteKeys = options.getHiddenNoteKeys();
    const addresses: CellAddress[] = [];
    for (const [key, cell] of options.getSheet().cells) {
      if (!cell.note || hiddenNoteKeys.includes(key)) continue;
      const [row, column] = key.split(":").map(Number) as [number, number];
      addresses.push({ row, column });
    }
    return addresses;
  });

  const visibleNotes = computed(() => {
    void options.getWorkbookRevision();
    if (notePreviewsSuppressed.value) return [];
    const addresses = new Map<string, CellAddress>();
    for (const address of allNoteAddresses.value)
      addresses.set(`${address.row}:${address.column}`, address);
    const noteDraft = options.getNoteDraft();
    const current =
      noteDraft?.address ??
      hoveredNoteAddress.value ??
      (options.getShowActiveNote()
        ? options.layout.value.getAnchorForAddress(options.activeCell.value)
        : undefined);
    if (current) addresses.set(`${current.row}:${current.column}`, current);
    const sheet = options.getSheet();
    return [...addresses].flatMap(([key, address]) => {
      const note = sheet.cells.get(key)?.note;
      const draft =
        noteDraft?.address.row === address.row && noteDraft.address.column === address.column
          ? noteDraft
          : undefined;
      if (!note && !draft) return [];
      const origin = noteOrigin(address);
      return origin ? [{ key: `${sheet.id}:${key}`, address, origin, note, draft }] : [];
    });
  });

  const { notePreviewRefs } = options;

  function onDocumentPointerDown(event: PointerEvent): void {
    if (
      options.isTransparentColorActive() &&
      event.target instanceof Element &&
      !event.target.closest("[data-picture-color-picker]")
    )
      options.cancelTransparentColor();
    if (
      options.isPictureCropActive() &&
      event.button === 0 &&
      event.target instanceof Element &&
      !event.target.closest(
        '[data-picture-crop-owner], [data-picture-crop-toolbar], [data-picture-tool="crop"], [data-owned-picture-context-menu], [data-floating-image-context-menu]',
      )
    ) {
      if (!options.finishPictureCrop()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
    }
    if (!(event.target instanceof Node)) return;
    for (const preview of notePreviewRefs.value) preview?.outsidePointerDown(event.target);
  }

  watch(
    () =>
      `${options.getSheet().id}:${options.activeCell.value.row}:${options.activeCell.value.column}`,
    () => {
      hoveredNoteAddress.value = undefined;
      for (const preview of notePreviewRefs.value) preview?.deselect();
    },
  );

  return {
    hoveredHyperlink,
    surfaceCursor,
    surfacePoint,
    imagePoint,
    cancelNotePreviewLeave,
    scheduleNotePreviewLeave,
    clearHyperlinkPointerGesture,
    onSurfacePointerDown,
    onSurfacePointerMove,
    onSurfacePointerLeave,
    onSurfaceContextMenu,
    onSurfaceDoubleClick,
    onSurfaceKeydown,
    visibleNotes,
    onDocumentPointerDown,
  };
}
