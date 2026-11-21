import {
  computed,
  nextTick,
  onBeforeUnmount,
  provide,
  ref,
  shallowRef,
  watch,
  type Ref,
} from "vue";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import {
  traverseShapeGroup,
  type ShapeGroupDrawing,
  type ShapeGroupPath,
} from "@sheetcraft/core/shape-group";
import { getShapeTextAssetIds } from "@sheetcraft/core/shape-text";
import type {
  SheetDrawing,
  SheetFramedGraphicDrawing,
  SheetGraphicDrawing,
} from "@sheetcraft/core/sheet-drawings";
import type { Sheet } from "@sheetcraft/core/workbook";
import type { ImageAssetStore } from "../../modules/image-assets/imageAssetStore";
import { createCanvasImageCache } from "../../modules/sheet-grid/canvas/image-painter";
import type ShapeFormatPaneType from "../../modules/sheet-drawings/components/shape-format/ShapeFormatPane.vue";
import { iconName } from "../../modules/sheet-drawings/icon-catalog";
import type { ShapeTextPreparationMode } from "../../modules/sheet-drawings/prepare-shape-text-update";
import { prepareTextBoxReferenceUpdate } from "../../modules/sheet-drawings/prepare-textbox-reference-update";
import type { ShapeCanvasTextEditRequest } from "../../modules/sheet-drawings/shape-canvas-text-edit-contract";
import { preflightShapeConnectorPaint } from "../../modules/sheet-drawings/shape-connector-paint-preflight";
import {
  shapeFormatOwnerKey,
  type ShapeFormatTab,
} from "../../modules/sheet-drawings/shape-format-pane-model";
import { createShapePaintAssetSource } from "../../modules/sheet-drawings/shape-paint-asset-source";
import {
  createShapeTextFieldDrafts,
  shapeTextFieldDraftsKey,
} from "../../modules/sheet-drawings/shape-text-field-drafts";
import { createTextBoxReferenceResolver } from "../../modules/sheet-drawings/textbox-reference-display";
import { useDrawingActions } from "../../modules/sheet-drawings/useDrawingActions";
import { useOwnedShapeConnectorFormatPane } from "../../modules/sheet-drawings/useOwnedShapeConnectorFormatPane";
import { useOwnedShapeFormatPane } from "../../modules/sheet-drawings/useOwnedShapeFormatPane";
import { useOwnedShapeGroupFormatPane } from "../../modules/sheet-drawings/useOwnedShapeGroupFormatPane";
import { useShapeCreation } from "../../modules/sheet-drawings/useShapeCreation";
import { useShapeFormatPresentation } from "../../modules/sheet-drawings/useShapeFormatPresentation";
import { useShapeObjectControls } from "../../modules/sheet-drawings/useShapeObjectControls";
import { useShapeRibbonFormat } from "../../modules/sheet-drawings/useShapeRibbonFormat";
import { useShapeTextCharacterFormatPane } from "../../modules/sheet-drawings/useShapeTextCharacterFormatPane";
import { useShapeTextEditSession } from "../../modules/sheet-drawings/useShapeTextEditSession";
import { useTextBoxReference } from "../../modules/sheet-drawings/useTextBoxReference";
import type { MessageKey, MessageParams } from "../../shared/i18n";
import { useRangeReferencePicker } from "../../shared/range-reference/useRangeReferencePicker";
import type { WorkspaceRuntime } from "../../shared/runtime/workspace-runtime";

type WorkspaceShapeFormatOptions = {
  runtime: WorkspaceRuntime;
  shapeObjectFormatPaneRef: Ref<InstanceType<typeof ShapeFormatPaneType> | undefined>;
  assetStore: ImageAssetStore;
  locale: Ref<string>;
  imageAssetUrls: Readonly<Ref<ReadonlyMap<string, string>>>;
  imageAssetSizes: Readonly<
    Ref<ReadonlyMap<string, { readonly width: number; readonly height: number }>>
  >;
  getShapeMetrics: (sheet: Sheet) => PictureSheetMetrics | undefined;
  getDrawingLayout: (sheet: Sheet) => Parameters<typeof prepareTextBoxReferenceUpdate>[3];
  flushPendingEdit: () => boolean;
  flushPendingCellEdit: () => boolean;
  flushPendingShapeTextEdit: () => boolean | undefined;
  selectDrawing: (id: string | null) => void;
  selectShapeObjects: (paths: readonly ShapeGroupPath[]) => boolean;
  onRootDrawingSelectionChanged: (id: string | null) => void;
  t: (key: MessageKey, params?: MessageParams) => string;
};

/**
 * Owns drawing actions, shape/group/connector/text-character format panes,
 * canvas shape-text editing, shape ribbon leases, shape object controls,
 * textbox reference dialogs, and shape creation orchestration.
 */
export function useWorkspaceShapeFormat(options: WorkspaceShapeFormatOptions) {
  const { runtime, assetStore, locale, imageAssetUrls, imageAssetSizes, t } = options;
  const { workbookGeneration, workbookRevision } = runtime;

  const shapeTextImages = createCanvasImageCache(() => {});
  onBeforeUnmount(shapeTextImages.dispose);

  function getShapePaintAssetSize(id: string) {
    const size = imageAssetSizes.value.get(id);
    if (size) return size;
    const image =
      shapePaintAssets.getAssetImage(id) ??
      (imageAssetUrls.value.get(id)
        ? shapeTextImages.peek?.(imageAssetUrls.value.get(id)!)
        : undefined);
    return image ? { width: image.naturalWidth, height: image.naturalHeight } : undefined;
  }

  const textBoxReferenceResolver = computed(() => {
    void workbookRevision.value;
    return createTextBoxReferenceResolver({
      workbook: runtime.getWorkbook(),
      evaluator: runtime.getEvaluator(),
      locale: locale.value,
    });
  });

  function prepareWorkspaceDrawing(
    sheet: Sheet,
    metrics: PictureSheetMetrics | undefined,
    next: SheetDrawing,
    owner: SheetDrawing | undefined,
    forest?: readonly SheetDrawing[],
    preparationMode?: ShapeTextPreparationMode,
  ): SheetDrawing {
    return prepareTextBoxReferenceUpdate(
      textBoxReferenceResolver.value,
      next,
      owner,
      options.getDrawingLayout(sheet),
      undefined,
      {
        resources: {
          theme: runtime.getWorkbook().theme,
          getAssetImage: (id) =>
            shapePaintAssets.getAssetImage(id) ??
            (imageAssetUrls.value.get(id)
              ? shapeTextImages.get(imageAssetUrls.value.get(id)!)
              : undefined),
          getAssetSize: getShapePaintAssetSize,
        },
      },
      metrics,
      forest
        ? {
            candidateForest: forest,
            sourceForest: sheet.drawings ?? [],
            revision: workbookRevision.value,
          }
        : undefined,
      preparationMode,
    );
  }

  const drawingActions = useDrawingActions({
    preflightConnectedCollection: (pass) => {
      preflightShapeConnectorPaint(pass, {
        theme: runtime.getWorkbook().theme,
        getAssetSize: getShapePaintAssetSize,
      });
      return true;
    },
    getMetrics: () => options.getShapeMetrics(runtime.getActiveSheet()),
    getWorkbook: runtime.getWorkbook,
    getSheet: runtime.getActiveSheet,
    getGeneration: () => workbookGeneration.value,
    getRevision: () => workbookRevision.value,
    getAddress: runtime.getActiveAddress,
    flush: options.flushPendingCellEdit,
    execute: runtime.executeCommand,
    isBusy: runtime.isBusy,
    name: (kind) => t(`drawing.${kind}`),
    iconName: (id) => iconName(id, locale.value),
    onIconInserted: (id) => {
      options.selectDrawing(id);
      void nextTick(runtime.focusGrid);
    },
    prepareDrawing: (next, owner, forest, preparationMode) =>
      prepareWorkspaceDrawing(
        runtime.getActiveSheet(),
        options.getShapeMetrics(runtime.getActiveSheet()),
        next,
        owner,
        forest,
        preparationMode,
      ),
  });
  const { dialog: drawingDialog, editing: editingDrawing } = drawingActions;

  const { shapeObjectFormatPaneRef } = options;
  const shapeFormatPane = useOwnedShapeFormatPane({
    getMetrics: () => options.getShapeMetrics(runtime.getActiveSheet()),
    getWorkbook: runtime.getWorkbook,
    getSheet: runtime.getActiveSheet,
    getGeneration: () => workbookGeneration.value,
    getRevision: () => workbookRevision.value,
    isBusy: runtime.isBusy,
    flush: options.flushPendingEdit,
    update: drawingActions.update,
    isAssetAvailable: (id) => imageAssetUrls.value.has(id) || shapePaintAssets.has(id),
    getUnsupportedReason: () => t("pictureFormat.capabilityReasons.unsupportedFeature"),
  });

  const shapeGroupFormatPane = useOwnedShapeGroupFormatPane({
    getMetrics: () => options.getShapeMetrics(runtime.getActiveSheet()),
    getWorkbook: runtime.getWorkbook,
    getSheet: runtime.getActiveSheet,
    getGeneration: () => workbookGeneration.value,
    getRevision: () => workbookRevision.value,
    isBusy: runtime.isBusy,
    flush: options.flushPendingEdit,
    replaceCollection: drawingActions.replaceCollection,
    replaceCollectionPreservingGeometry: drawingActions.replaceCollectionPreservingGeometry,
    isAssetAvailable: (id) => imageAssetUrls.value.has(id) || shapePaintAssets.has(id),
    getUnsupportedReason: () => t("pictureFormat.capabilityReasons.unsupportedFeature"),
    getCameraUnsupportedReason: () => t("drawing.groupCameraConnectorUnavailable"),
    getScopeDescription: (scope) => {
      const description = t("drawing.groupFormatScope", {
        count: scope.descendantCount,
        body: scope.bodyEligibleCount,
        text: scope.textEligibleCount,
      });
      return scope.rotation3dShared
        ? `${description} ${t("drawing.groupCameraScope", { count: scope.rotation3dAffectedCount })}`
        : description;
    },
  });

  const shapeConnectorFormatPane = useOwnedShapeConnectorFormatPane({
    getLocale: () => (locale.value === "zh-CN" ? "zh-CN" : "en-US"),
    getMetrics: () => options.getShapeMetrics(runtime.getActiveSheet()),
    getWorkbook: runtime.getWorkbook,
    getSheet: runtime.getActiveSheet,
    getGeneration: () => workbookGeneration.value,
    getRevision: () => workbookRevision.value,
    isBusy: runtime.isBusy,
    flush: options.flushPendingEdit,
    replaceCollection: drawingActions.replaceCollection,
    isAssetAvailable: (id) => imageAssetUrls.value.has(id) || shapePaintAssets.has(id),
    getUnsupportedReason: () => t("pictureFormat.capabilityReasons.unsupportedFeature"),
    getPaintResources: () => ({
      theme: runtime.getWorkbook().theme,
      getAssetSize: getShapePaintAssetSize,
    }),
  });

  const shapeTextEditSelection = shallowRef<{ start: number; end: number }>();
  const shapeTextFieldDrafts = createShapeTextFieldDrafts();
  provide(shapeTextFieldDraftsKey, shapeTextFieldDrafts);

  const shapeTextEdit = useShapeTextEditSession({
    getMetrics: () => options.getShapeMetrics(runtime.getActiveSheet()),
    getWorkbook: runtime.getWorkbook,
    getSheet: runtime.getActiveSheet,
    getGeneration: () => workbookGeneration.value,
    getRevision: () => workbookRevision.value,
    isBusy: runtime.isBusy,
    flush: options.flushPendingCellEdit,
    replaceCollection: drawingActions.replaceCollection,
    flushFieldDrafts: (id) => shapeTextFieldDrafts.flush(`shape-text-${id}`).accepted,
    focusFieldDraft: (id) => shapeTextFieldDrafts.focusRejected(`shape-text-${id}`),
  });
  const shapeTextEditCallbacks = computed(() => {
    const current = shapeTextEdit.snapshot.value;
    return current ? shapeTextEdit.callbacks(current.sessionId) : undefined;
  });

  const shapeTextCharacterPane = useShapeTextCharacterFormatPane({
    getSnapshot: () => shapeTextEdit.snapshot.value,
    getTheme: () => runtime.getWorkbook().theme,
    getCallbacks: () => shapeTextEditCallbacks.value,
    getWorkbookId: () => runtime.getWorkbook().id,
    getSheetId: () => runtime.getActiveSheet().id,
    getLocale: () => (locale.value === "zh-CN" ? "zh-CN" : "en-US"),
  });

  const shapeFormatPresentation = useShapeFormatPresentation(() => {
    const edit = shapeTextCharacterPane.snapshot.value ? shapeTextEdit.snapshot.value : undefined;
    const connector = shapeConnectorFormatPane.snapshot.value;
    const group = shapeGroupFormatPane.snapshot.value;
    const object = shapeFormatPane.snapshot.value;
    const rootId =
      edit?.sourceRootId ??
      (connector
        ? shapeConnectorFormatPane.root.value?.id
        : group
          ? shapeGroupFormatPane.root.value?.id
          : object?.drawing.id);
    const path =
      edit?.path ??
      (connector
        ? shapeConnectorFormatPane.path.value
        : group
          ? shapeGroupFormatPane.path.value
          : object
            ? [object.drawing.id]
            : undefined);
    if (!rootId || !path) return undefined;
    return {
      workbook: runtime.getWorkbook(),
      generation: workbookGeneration.value,
      sheet: runtime.getActiveSheet(),
      rootId,
      path,
    };
  });

  function closeAllShapeFormatPanes(cancelAssets = false): void {
    shapeTextCharacterPane.close();
    shapeFormatPane.close();
    shapeGroupFormatPane.close();
    shapeConnectorFormatPane.close();
    if (cancelAssets) shapePaintAssets.cancel();
  }

  runtime.coordinator.registerPane("shape", () => closeAllShapeFormatPanes(false));

  function startShapeTextEdit(request: ShapeCanvasTextEditRequest): boolean {
    const keepPropertiesOpen = !!(
      shapeTextCharacterPane.snapshot.value ||
      shapeFormatPane.snapshot.value ||
      shapeGroupFormatPane.snapshot.value ||
      shapeConnectorFormatPane.snapshot.value
    );
    const previous = shapeTextEdit.snapshot.value;
    if (previous && !shapeTextEdit.commit(previous.sessionId)) return false;
    if (!shapeTextEdit.begin(request.root, request.path)) return false;
    const opened = shapeTextEdit.snapshot.value!;
    if (
      request.text !== undefined &&
      !shapeTextEdit.update(opened.sessionId, opened.text + request.text)
    )
      return false;
    const length = shapeTextEdit.snapshot.value!.draftText.length;
    shapeTextEditSelection.value = { start: request.selection === "all" ? 0 : length, end: length };
    shapeTextEdit.setSelection(opened.sessionId, {
      ...shapeTextEditSelection.value,
      direction: request.selection === "all" ? "forward" : "none",
    });
    if (keepPropertiesOpen) {
      runtime.coordinator.notifyPaneOpened("shape");
      shapeTextCharacterPane.open();
    } else {
      shapeTextCharacterPane.close();
    }
    shapeFormatPane.close();
    shapeGroupFormatPane.close();
    shapeConnectorFormatPane.close();
    drawingActions.close();
    return true;
  }

  const textBoxReferenceActions = useTextBoxReference({
    getWorkbook: runtime.getWorkbook,
    getSheet: runtime.getActiveSheet,
    getGeneration: () => workbookGeneration.value,
    getRevision: () => workbookRevision.value,
    getMetrics: () => options.getShapeMetrics(runtime.getActiveSheet()),
    getResolver: () => textBoxReferenceResolver.value,
    isBusy: runtime.isBusy,
    flush: () => (options.flushPendingShapeTextEdit() ?? true) && options.flushPendingCellEdit(),
    replaceCollection: drawingActions.replaceCollectionPreservingGeometry,
  });
  const { dialog: textBoxReferenceDialog } = textBoxReferenceActions;
  const textBoxReferencePicker = useRangeReferencePicker(() => runtime.getActiveSheet().name, {
    singleCell: true,
  });
  const { active: pickingTextBoxReference, reference: pickedTextBoxReference } =
    textBoxReferencePicker;
  watch(textBoxReferenceDialog, () => textBoxReferencePicker.cancel(), { flush: "sync" });
  const selectTextBoxReference = computed(() => {
    const request = textBoxReferenceDialog.value;
    return async (current: string): Promise<string | undefined> => {
      if (!request?.isCurrent()) return undefined;
      const selected = await textBoxReferencePicker.selectReference(current, { singleCell: true });
      return request.isCurrent() ? selected : undefined;
    };
  });
  const textBoxReferencePickerCallbacks = computed(() => {
    const request = textBoxReferenceDialog.value;
    return {
      confirm: () => {
        if (textBoxReferenceDialog.value !== request) return;
        if (request?.isCurrent()) textBoxReferencePicker.confirm();
        else textBoxReferencePicker.cancel();
      },
      cancel: () => {
        if (textBoxReferenceDialog.value === request) textBoxReferencePicker.cancel();
      },
    };
  });

  function openShapeGroupFormat(root: ShapeGroupDrawing, path: ShapeGroupPath) {
    const selected = traverseShapeGroup(root).find(
      ({ path: current }) => JSON.stringify(current) === JSON.stringify(path),
    )?.node;
    if (selected?.kind === "shape" && selected.shapeConnector) {
      if (shapeConnectorFormatPane.open(root, path)) {
        runtime.coordinator.notifyPaneOpened("shape");
        shapeGroupFormatPane.close();
        shapeFormatPane.close();
        drawingActions.close();
        options.selectShapeObjects([path]);
      }
      return;
    }
    if (shapeGroupFormatPane.open(root, path)) {
      runtime.coordinator.notifyPaneOpened("shape");
      shapeConnectorFormatPane.close();
      shapeFormatPane.close();
      drawingActions.close();
      options.selectShapeObjects([path]);
    }
  }

  function selectedShapeGroupChanged(rootId: string | null, path: ShapeGroupPath | null) {
    const connectorRoot = shapeConnectorFormatPane.root.value;
    if (
      connectorRoot?.kind === "shapeGroup" &&
      (connectorRoot.id !== rootId ||
        JSON.stringify(shapeConnectorFormatPane.path.value) !== JSON.stringify(path))
    ) {
      shapeConnectorFormatPane.close();
      shapePaintAssets.cancel();
    }
    if (
      shapeGroupFormatPane.root.value &&
      (shapeGroupFormatPane.root.value.id !== rootId ||
        JSON.stringify(shapeGroupFormatPane.path.value) !== JSON.stringify(path))
    ) {
      shapeGroupFormatPane.close();
      shapePaintAssets.cancel();
    }
  }

  const shapePaintAssets = createShapePaintAssetSource({
    getSnapshot: () =>
      shapeTextCharacterPane.ribbonSnapshot.value ??
      shapeRibbonFormat.snapshot.value ??
      shapeConnectorFormatPane.snapshot.value ??
      shapeGroupFormatPane.snapshot.value ??
      shapeFormatPane.snapshot.value,
    store: assetStore,
    preparePixels: async (asset) => {
      if (asset.width * asset.height * 4 > 64 * 1024 * 1024) return;
      const url = URL.createObjectURL(asset.blob),
        image = new Image();
      try {
        image.src = url;
        await image.decode();
        return image;
      } finally {
        URL.revokeObjectURL(url);
      }
    },
  });
  onBeforeUnmount(shapePaintAssets.dispose);

  watch(
    () =>
      [
        shapeFormatPane.drawing.value,
        drawingDialog.value?.initial,
        shapeGroupFormatPane.root.value,
        shapeTextEdit.snapshot.value?.draftView,
        imageAssetUrls.value,
      ] as const,
    ([selected, edited, group, draft, urls]) => {
      const retained = new Set<string>();
      const groupText = group
        ? traverseShapeGroup(group).flatMap((visit) =>
            visit.node.kind === "shape" || visit.node.kind === "textBox" ? [visit.node] : [],
          )
        : [];
      for (const textOwner of [selected, edited, draft, ...groupText])
        for (const id of getShapeTextAssetIds(textOwner?.shapeText, textOwner?.text)) {
          const url = urls.get(id);
          if (url) {
            retained.add(url);
            shapeTextImages.get(url);
          }
        }
      shapeTextImages.retain(retained);
    },
    { immediate: true },
  );

  const shapePaneRequestedTab = ref<ShapeFormatTab>("fill-line");
  function beforeShapeFormatTabChange(tab: ShapeFormatTab): boolean {
    const edit = shapeTextEdit.snapshot.value;
    if (!edit || (tab !== "size-properties" && tab !== "effects")) return true;
    const rootId = edit.sourceRootId,
      path = edit.path,
      sheet = runtime.getActiveSheet();
    if (options.flushPendingShapeTextEdit() === false || runtime.getActiveSheet() !== sheet)
      return false;
    const root = sheet.drawings?.find((value) => value.id === rootId);
    if (!root) return false;
    const opened =
      root.kind === "shapeGroup"
        ? shapeGroupFormatPane.open(root, path)
        : shapeFormatPane.open(root);
    if (!opened) return false;
    runtime.coordinator.notifyPaneOpened("shape");
    shapePaneRequestedTab.value = tab;
    return true;
  }

  function openShapeFormat(drawing: SheetGraphicDrawing | SheetFramedGraphicDrawing) {
    if (drawing.kind === "shape" && drawing.shapeConnector) {
      if (shapeConnectorFormatPane.open(drawing)) {
        runtime.coordinator.notifyPaneOpened("shape");
        shapeFormatPane.close();
        shapeGroupFormatPane.close();
        drawingActions.close();
        options.selectDrawing(drawing.id);
      }
      return;
    }
    if (shapeFormatPane.open(drawing)) {
      runtime.coordinator.notifyPaneOpened("shape");
      shapeConnectorFormatPane.close();
      shapeGroupFormatPane.close();
      drawingActions.close();
      options.selectDrawing(drawing.id);
    }
  }

  function selectedShapeChanged(id: string | null) {
    options.onRootDrawingSelectionChanged(id);
    if (shapeConnectorFormatPane.root.value && shapeConnectorFormatPane.root.value.id !== id) {
      shapeConnectorFormatPane.close();
      shapePaintAssets.cancel();
    }
    if (shapeGroupFormatPane.root.value && shapeGroupFormatPane.root.value.id !== id) {
      shapeGroupFormatPane.close();
      shapePaintAssets.cancel();
    }
    if (shapeFormatPane.drawing.value && shapeFormatPane.drawing.value.id !== id) {
      shapeFormatPane.close();
      shapePaintAssets.cancel();
    }
  }

  const shapeInteractionBlocked = ref(false);
  let shapeCreationEditorIntent = 0;
  const shapeCreation = useShapeCreation({
    getMetrics: () => options.getShapeMetrics(runtime.getActiveSheet()),
    getWorkbook: runtime.getWorkbook,
    getSheet: runtime.getActiveSheet,
    getGeneration: () => workbookGeneration.value,
    getRevision: () => workbookRevision.value,
    getAddress: runtime.getActiveAddress,
    isBusy: () => runtime.isBusy() || shapeInteractionBlocked.value,
    flush: options.flushPendingEdit,
    name: (choice) => choice.label[locale.value === "zh-CN" ? "zh-CN" : "en-US"],
    getTextBoxFontFamily: () => runtime.getWorkbook().theme.bodyFont,
    onStart: () => {
      shapeCreationEditorIntent++;
      drawingActions.close();
      options.selectDrawing(null);
    },
    execute: runtime.executeCommand,
    onCreated: (drawing, request) => {
      const token = ++shapeCreationEditorIntent;
      if (request.continuous) return;
      if (drawing.kind !== "textBox") {
        options.selectDrawing(drawing.id);
        return;
      }
      // Core normalizes the creation payload again: edit only the durable root,
      // after the updated worksheet metrics have reached the grid.
      const root = request.sheet.drawings?.find((node) => node.id === drawing.id);
      const revision = workbookRevision.value;
      if (!root || root.kind !== "textBox") return;
      void nextTick(() => {
        if (
          token !== shapeCreationEditorIntent ||
          runtime.getWorkbook() !== request.workbook ||
          runtime.getActiveSheet() !== request.sheet ||
          workbookGeneration.value !== request.generation ||
          workbookRevision.value !== revision ||
          runtime.isBusy() ||
          shapeInteractionBlocked.value ||
          shapeCreation.request.value ||
          shapeTextEdit.snapshot.value ||
          !request.sheet.drawings?.includes(root) ||
          !options.selectShapeObjects([[root.id]])
        )
          return;
        startShapeTextEdit({ root, selection: "end" });
      });
    },
  });

  const selectedShapeObjectPaths = shallowRef<readonly ShapeGroupPath[]>([]);
  function selectedShapeObjectsChanged(paths: readonly ShapeGroupPath[], owner: Sheet) {
    if (owner !== runtime.getActiveSheet()) return;
    if (JSON.stringify(paths) === JSON.stringify(selectedShapeObjectPaths.value)) return;
    selectedShapeObjectPaths.value = paths.map((path) => [...path]);
  }

  function formatShapeObjectPath(path: ShapeGroupPath): boolean {
    const root = runtime.getActiveSheet().drawings?.find((node) => node.id === path[0]);
    if (!root) return false;
    if (root.kind === "shapeGroup") {
      openShapeGroupFormat(root, path);
      return (
        JSON.stringify(shapeGroupFormatPane.path.value ?? shapeConnectorFormatPane.path.value) ===
        JSON.stringify(path)
      );
    }
    if (path.length !== 1 || (root.kind !== "shape" && root.kind !== "textBox")) return false;
    openShapeFormat(root);
    return (
      shapeFormatPane.drawing.value?.id === root.id ||
      shapeConnectorFormatPane.root.value?.id === root.id
    );
  }

  const shapeRibbonFormat = useShapeRibbonFormat({
    getPaths: () => selectedShapeObjectPaths.value,
    isTextEditing: () => !!shapeTextEdit.snapshot.value,
    root: {
      getMetrics: () => options.getShapeMetrics(runtime.getActiveSheet()),
      getWorkbook: runtime.getWorkbook,
      getSheet: runtime.getActiveSheet,
      getGeneration: () => workbookGeneration.value,
      getRevision: () => workbookRevision.value,
      isBusy: runtime.isBusy,
      flush: options.flushPendingEdit,
      update: drawingActions.update,
      isAssetAvailable: (id) => imageAssetUrls.value.has(id) || shapePaintAssets.has(id),
      getUnsupportedReason: () => t("pictureFormat.capabilityReasons.unsupportedFeature"),
    },
    group: {
      getMetrics: () => options.getShapeMetrics(runtime.getActiveSheet()),
      getWorkbook: runtime.getWorkbook,
      getSheet: runtime.getActiveSheet,
      getGeneration: () => workbookGeneration.value,
      getRevision: () => workbookRevision.value,
      isBusy: runtime.isBusy,
      flush: options.flushPendingEdit,
      replaceCollection: drawingActions.replaceCollection,
      replaceCollectionPreservingGeometry: drawingActions.replaceCollectionPreservingGeometry,
      isAssetAvailable: (id) => imageAssetUrls.value.has(id) || shapePaintAssets.has(id),
      getUnsupportedReason: () => t("pictureFormat.capabilityReasons.unsupportedFeature"),
      getCameraUnsupportedReason: () => t("drawing.groupCameraConnectorUnavailable"),
    },
  });

  const shapeRibbonSnapshot = computed(() =>
    shapeTextEdit.snapshot.value
      ? shapeTextCharacterPane.ribbonSnapshot.value
      : shapeRibbonFormat.snapshot.value,
  );
  const shapeRibbonCapabilities = computed(() =>
    shapeTextEdit.snapshot.value
      ? shapeTextCharacterPane.capabilities.value
      : shapeRibbonFormat.capabilities.value,
  );
  function shapeRibbonIntent(intent: Parameters<typeof shapeRibbonFormat.onIntent>[0]): boolean {
    return shapeTextEdit.snapshot.value
      ? shapeTextCharacterPane.onIntent(intent)
      : shapeRibbonFormat.onIntent(intent);
  }

  function selectedShapeFieldLease(snapshot: NonNullable<typeof shapeRibbonFormat.snapshot.value>) {
    const owner = shapeFormatOwnerKey(snapshot.owner),
      fieldOwner = snapshot.owner.sessionId,
      workbook = runtime.getWorkbook(),
      sheet = runtime.getActiveSheet(),
      generation = workbookGeneration.value,
      paths = JSON.stringify(selectedShapeObjectPaths.value);
    const current = () => {
      const selected = shapeRibbonFormat.snapshot.value;
      return (
        !shapeTextEdit.snapshot.value &&
        runtime.getWorkbook() === workbook &&
        runtime.getActiveSheet() === sheet &&
        workbookGeneration.value === generation &&
        JSON.stringify(selectedShapeObjectPaths.value) === paths &&
        !!selected &&
        shapeFormatOwnerKey(selected.owner) === owner
      );
    };
    return { fieldOwner, current };
  }

  function ownsSelectedShapeFieldTarget(target: EventTarget | null): boolean {
    const snapshot = shapeRibbonFormat.snapshot.value;
    if (!(target instanceof Node) || !target.isConnected) return false;
    if (snapshot) {
      const lease = selectedShapeFieldLease(snapshot);
      if (
        lease.current() &&
        shapeTextFieldDrafts.ownsTarget(lease.fieldOwner, target) &&
        lease.current()
      )
        return true;
    }
    const paneLease = selectedShapePaneFieldLease(snapshot);
    return (
      !!paneLease &&
      paneLease.current() &&
      shapeTextFieldDrafts.ownsTarget(`shape-pane:${paneLease.pane.owner.sessionId}`, target) &&
      paneLease.current()
    );
  }

  /** Connector selections intentionally have no ordinary Shape Ribbon session. */
  function selectedConnectorPaneFieldLease(
    pane: NonNullable<typeof shapeConnectorFormatPane.snapshot.value>,
  ) {
    if (shapeConnectorFormatPane.snapshot.value !== pane) return;
    const workbook = runtime.getWorkbook(),
      sheet = runtime.getActiveSheet(),
      generation = workbookGeneration.value,
      owner = shapeFormatOwnerKey(pane.owner),
      paths = JSON.stringify(selectedShapeObjectPaths.value);
    return {
      current: () => {
        const selected = shapeConnectorFormatPane.snapshot.value,
          selectedPaths = selectedShapeObjectPaths.value;
        return (
          !shapeTextEdit.snapshot.value &&
          runtime.getWorkbook() === workbook &&
          runtime.getActiveSheet() === sheet &&
          workbookGeneration.value === generation &&
          workbook.sheets.get(sheet.id) === sheet &&
          selectedPaths.length === 1 &&
          JSON.stringify(selectedPaths) === paths &&
          JSON.stringify(shapeConnectorFormatPane.path.value) ===
            JSON.stringify(selectedPaths[0]) &&
          !!selected &&
          selected.owner.workbookId === workbook.id &&
          selected.owner.sheetId === sheet.id &&
          shapeFormatOwnerKey(selected.owner) === owner
        );
      },
    };
  }

  function selectedShapePaneFieldLease(snapshot = shapeRibbonFormat.snapshot.value) {
    // The properties pane and Ribbon hold independent command sessions. A pane
    // popup may retain only the same uniquely selected, complete object path.
    const getPaneSnapshot = () =>
      shapeConnectorFormatPane.snapshot.value ??
      shapeGroupFormatPane.snapshot.value ??
      shapeFormatPane.snapshot.value;
    const getPanePath = () =>
      shapeConnectorFormatPane.snapshot.value
        ? shapeConnectorFormatPane.path.value
        : shapeGroupFormatPane.snapshot.value
          ? shapeGroupFormatPane.path.value
          : shapeFormatPane.drawing.value
            ? [shapeFormatPane.drawing.value.id]
            : undefined;
    const pane = getPaneSnapshot(),
      element = shapeObjectFormatPaneRef.value?.$el;
    if (!pane || !(element instanceof HTMLElement)) return;
    const lease = snapshot
      ? selectedShapeFieldLease(snapshot)
      : selectedConnectorPaneFieldLease(pane);
    if (!lease) return;
    const comparison = snapshot ?? pane;
    const owner = shapeFormatOwnerKey(pane.owner);
    const current = () => {
      const selectedPane = getPaneSnapshot(),
        paths = selectedShapeObjectPaths.value,
        style = getComputedStyle(element);
      return (
        lease.current() &&
        shapeObjectFormatPaneRef.value?.$el === element &&
        element.isConnected &&
        !element.hidden &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        !!selectedPane &&
        shapeFormatOwnerKey(selectedPane.owner) === owner &&
        selectedPane.owner.workbookId === comparison.owner.workbookId &&
        selectedPane.owner.sheetId === comparison.owner.sheetId &&
        selectedPane.owner.drawingId === comparison.owner.drawingId &&
        paths.length === 1 &&
        JSON.stringify(getPanePath()) === JSON.stringify(paths[0])
      );
    };
    return { pane, element, current };
  }

  function flushSelectedShapeFieldDrafts(snapshot = shapeRibbonFormat.snapshot.value): boolean {
    if (!snapshot) return true;
    const lease = selectedShapeFieldLease(snapshot);
    // A successful field command may advance revision. Its exact selection owner must survive.
    return (
      lease.current() && shapeTextFieldDrafts.flush(lease.fieldOwner).accepted && lease.current()
    );
  }

  function beforeShapeContextChange(): boolean {
    const edit = shapeTextEdit.snapshot.value;
    return edit
      ? shapeTextFieldDrafts.flush(`shape-text-${edit.sessionId}`).accepted
      : flushSelectedShapeFieldDrafts();
  }

  const shapeObjectControls = useShapeObjectControls({
    getWorkbook: runtime.getWorkbook,
    getSheet: runtime.getActiveSheet,
    getGeneration: () => workbookGeneration.value,
    getRevision: () => workbookRevision.value,
    getMetrics: () => options.getShapeMetrics(runtime.getActiveSheet()),
    getSelection: () => selectedShapeObjectPaths.value,
    isBusy: () => runtime.isBusy() || shapeInteractionBlocked.value,
    flush: options.flushPendingEdit,
    select: options.selectShapeObjects,
    format: formatShapeObjectPath,
    replaceCollection: drawingActions.replaceCollection,
    replaceVisibilityCollection: drawingActions.replaceVisibilityCollection,
  });

  const shapeRibbonObjectTools = computed(() => {
    const tools = shapeObjectControls.snapshot.value;
    if (!tools) return undefined;
    const lease = shapeTextEdit.snapshot.value;
    const request = (
      action: "format" | "selection" | Parameters<typeof tools.actionHandler>[0],
    ) => {
      if (lease && action === "format") {
        if (shapeTextEdit.snapshot.value?.sessionId !== lease.sessionId) return false;
        runtime.coordinator.notifyPaneOpened("shape");
        shapeTextCharacterPane.open();
        return true;
      }
      if (lease) {
        if (
          shapeTextEdit.snapshot.value?.sessionId !== lease.sessionId ||
          options.flushPendingShapeTextEdit() === false
        )
          return false;
      }
      const current = shapeObjectControls.snapshot.value;
      if (!current) return false;
      return action === "format"
        ? current.formatHandler()
        : action === "selection"
          ? current.selectionPaneHandler()
          : current.actionHandler(action);
    };
    return {
      ...tools,
      locale: locale.value === "zh-CN" ? ("zh-CN" as const) : ("en-US" as const),
      actionHandler: (action: Parameters<typeof tools.actionHandler>[0]) => request(action),
      formatHandler: () => request("format"),
      selectionPaneHandler: () => request("selection"),
    };
  });

  watch(
    () => [runtime.getActiveSheet(), workbookGeneration.value],
    () => {
      selectedShapeObjectPaths.value = [];
      shapeObjectControls.paneVisible.value = false;
    },
  );

  const activeShapeFormatPaneSnapshot = computed(
    () =>
      shapeTextCharacterPane.snapshot.value ??
      shapeConnectorFormatPane.snapshot.value ??
      shapeGroupFormatPane.snapshot.value ??
      shapeFormatPane.snapshot.value,
  );
  const activeShapeFormatPaneCapabilities = computed(() =>
    shapeTextCharacterPane.snapshot.value
      ? shapeTextCharacterPane.capabilities.value
      : shapeConnectorFormatPane.snapshot.value
        ? shapeConnectorFormatPane.capabilities.value
        : shapeGroupFormatPane.snapshot.value
          ? shapeGroupFormatPane.capabilities.value
          : shapeFormatPane.capabilities.value,
  );
  const activeShapeFormatPaneIntent = computed(() =>
    shapeTextCharacterPane.snapshot.value
      ? shapeTextCharacterPane.onIntent
      : shapeConnectorFormatPane.snapshot.value
        ? shapeConnectorFormatPane.onIntent
        : shapeGroupFormatPane.snapshot.value
          ? shapeGroupFormatPane.onIntent
          : shapeFormatPane.onIntent,
  );
  const activeShapeFormatInitialTab = computed<ShapeFormatTab>(() =>
    shapeTextCharacterPane.snapshot.value
      ? shapeTextCharacterPane.snapshot.value.drawing.kind === "shape" &&
        shapeTextCharacterPane.snapshot.value.drawing.wordArt
        ? "text-fill-line"
        : "text-box"
      : shapePaneRequestedTab.value,
  );

  return {
    getShapePaintAssetSize,
    textBoxReferenceResolver,
    prepareWorkspaceDrawing,
    drawingActions,
    drawingDialog,
    editingDrawing,
    shapeObjectFormatPaneRef,
    shapeFormatPane,
    shapeGroupFormatPane,
    shapeConnectorFormatPane,
    shapeTextEditSelection,
    shapeTextEdit,
    shapeTextEditCallbacks,
    shapeTextCharacterPane,
    shapeFormatPresentation,
    closeAllShapeFormatPanes,
    startShapeTextEdit,
    textBoxReferenceActions,
    textBoxReferenceDialog,
    textBoxReferencePicker,
    pickingTextBoxReference,
    pickedTextBoxReference,
    selectTextBoxReference,
    textBoxReferencePickerCallbacks,
    openShapeGroupFormat,
    selectedShapeGroupChanged,
    shapePaintAssets,
    shapePaneRequestedTab,
    beforeShapeFormatTabChange,
    openShapeFormat,
    selectedShapeChanged,
    shapeInteractionBlocked,
    shapeCreation,
    selectedShapeObjectPaths,
    selectedShapeObjectsChanged,
    shapeRibbonFormat,
    shapeRibbonSnapshot,
    shapeRibbonCapabilities,
    shapeRibbonIntent,
    ownsSelectedShapeFieldTarget,
    selectedShapePaneFieldLease,
    flushSelectedShapeFieldDrafts,
    beforeShapeContextChange,
    shapeObjectControls,
    shapeRibbonObjectTools,
    activeShapeFormatPaneSnapshot,
    activeShapeFormatPaneCapabilities,
    activeShapeFormatPaneIntent,
    activeShapeFormatInitialTab,
  };
}
